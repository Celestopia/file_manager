// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Notifications, useNotifications } from "./Notifications";
function Harness() {
  const notifications = useNotifications();
  return (
    <>
      <button onClick={() => notifications.setStatus("Saved")}>Notify</button>
      <button onClick={() => notifications.setError("Disk full")}>Fail</button>
      <Notifications {...notifications} />
    </>
  );
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it("dismisses notifications after five seconds", () => {
  render(<Harness />);
  fireEvent.click(screen.getByText("Notify"));
  act(() => vi.advanceTimersByTime(4999));
  expect(screen.getByRole("status")).toHaveTextContent("Saved");
  act(() => vi.advanceTimersByTime(1));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
it("restarts the timeout for repeated messages without stacking progress", () => {
  render(<Harness />);
  fireEvent.click(screen.getByText("Notify"));
  act(() => vi.advanceTimersByTime(4000));
  fireEvent.click(screen.getByText("Notify"));
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.getAllByRole("status")).toHaveLength(1);
  act(() => vi.advanceTimersByTime(4000));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
it("lets errors and status notices expire independently and supports dismissal", () => {
  render(<Harness />);
  fireEvent.click(screen.getByText("Fail"));
  act(() => vi.advanceTimersByTime(3000));
  fireEvent.click(screen.getByText("Notify"));
  act(() => vi.advanceTimersByTime(2000));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("Dismiss notification"));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("Fail"));
  fireEvent.click(screen.getByLabelText("Dismiss error"));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
