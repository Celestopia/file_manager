use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Manifest {
    pub schema_version: u32,
    pub id: String,
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Availability {
    Present,
    Missing,
    Unavailable,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Observation {
    pub availability: Availability,
    pub size_bytes: Option<u64>,
    pub file_modified_at: Option<String>,
    pub content_hash: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Source {
    pub id: String,
    pub path: String,
    pub title: String,
    pub description: String,
    pub source_url: String,
    pub tag_ids: Vec<String>,
    pub created_at: String,
    pub modified_at: String,
    pub observation: Observation,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Note {
    pub id: String,
    pub source_id: String,
    pub title: String,
    pub description: String,
    pub created_at: String,
    pub modified_at: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Tag {
    pub id: String,
    pub name: String,
    #[serde(deserialize_with = "Option::<String>::deserialize")]
    pub parent_id: Option<String>,
    pub description: String,
    pub created_at: String,
    pub modified_at: String,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Catalog {
    pub sources: Vec<Source>,
    pub notes: Vec<Note>,
    pub tags: Vec<Tag>,
}
#[derive(Clone, Serialize)]
pub struct Snapshot {
    pub note_sizes: std::collections::BTreeMap<String, Option<u64>>,
    pub root: String,
    pub catalog: Catalog,
}
#[derive(Default, Clone, Serialize)]
pub struct RefreshSummary {
    pub scanned: usize,
    pub added: usize,
    pub moved: usize,
    pub missing: usize,
    pub unavailable: usize,
    pub warnings: Vec<String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SourceEdit {
    pub id: String,
    pub title: String,
    pub description: String,
    pub source_url: String,
    pub tag_ids: Vec<String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NoteEdit {
    pub id: Option<String>,
    pub source_id: String,
    pub title: String,
    pub description: String,
    pub body: String,
    pub body_changed: bool,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TagEdit {
    pub id: Option<String>,
    pub name: String,
    #[serde(deserialize_with = "Option::<String>::deserialize")]
    pub parent_id: Option<String>,
    pub description: String,
}
pub fn now() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}
pub fn id() -> String {
    uuid::Uuid::new_v4().to_string()
}

#[derive(Clone, Serialize)]
pub struct TagDeletionImpact {
    pub path: String,
    pub affected_sources: usize,
    pub detached_children: usize,
}
