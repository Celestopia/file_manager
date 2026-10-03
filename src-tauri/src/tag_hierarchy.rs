use crate::model::{Catalog, Tag, TagDeletionImpact, now};
use anyhow::{Context, Result, ensure};
use std::collections::{HashMap, HashSet};

pub fn validate(tags: &[Tag]) -> Result<()> {
    let by_id: HashMap<_, _> = tags.iter().map(|t| (t.id.as_str(), t)).collect();
    let mut siblings = HashSet::new();
    for tag in tags {
        ensure!(
            siblings.insert((tag.parent_id.as_deref(), tag.name.as_str())),
            "Duplicate sibling tag name ‘{}’; rename or move the conflicting tag first",
            tag.name
        );
        if let Some(parent) = &tag.parent_id {
            ensure!(
                by_id.contains_key(parent.as_str()),
                "Unknown parent for tag ‘{}’",
                tag.name
            );
        }
    }
    let mut complete = HashSet::new();
    for tag in tags {
        let mut chain = HashSet::new();
        let mut current = Some(tag.id.as_str());
        while let Some(id) = current {
            if complete.contains(id) {
                break;
            }
            ensure!(
                chain.insert(id),
                "Tag parent cycle involving ‘{}’",
                tag.name
            );
            current = by_id[id].parent_id.as_deref();
        }
        complete.extend(chain);
    }
    Ok(())
}

pub fn path(tags: &[Tag], id: &str) -> String {
    let by_id: HashMap<_, _> = tags.iter().map(|t| (t.id.as_str(), t)).collect();
    let mut names = Vec::new();
    let mut current = Some(id);
    while let Some(id) = current {
        let Some(tag) = by_id.get(id) else {
            break;
        };
        names.push(tag.name.as_str());
        current = tag.parent_id.as_deref();
    }
    names.reverse();
    names.join(" → ")
}

pub fn plan_deletion(catalog: &Catalog, id: &str) -> Result<(Catalog, TagDeletionImpact)> {
    catalog
        .tags
        .iter()
        .find(|t| t.id == id)
        .context("Unknown tag")?;
    let mut next = catalog.clone();
    let timestamp = now();
    let mut impact = TagDeletionImpact {
        path: path(&catalog.tags, id),
        affected_sources: 0,
        detached_children: 0,
    };
    next.tags.retain(|t| t.id != id);
    for tag in &mut next.tags {
        if tag.parent_id.as_deref() == Some(id) {
            tag.parent_id = None;
            tag.modified_at = timestamp.clone();
            impact.detached_children += 1;
        }
    }
    for source in &mut next.sources {
        if source.tag_ids.iter().any(|assigned| assigned == id) {
            source.tag_ids.retain(|assigned| assigned != id);
            source.modified_at = timestamp.clone();
            impact.affected_sources += 1;
        }
    }
    validate(&next.tags)
        .context("Cannot delete tag because promoting its children would conflict")?;
    Ok((next, impact))
}
