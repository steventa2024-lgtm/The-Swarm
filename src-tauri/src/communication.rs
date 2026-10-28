//! Deterministic communication intents. IDs stay in audit records, never prose.
pub fn label(value: &str, fallback: &str) -> String {
    let lower = value.to_ascii_lowercase();
    if value.is_empty()
        || value.len() > 240
        || value.chars().any(char::is_control)
        || [
            "token", "secret", "password", "sk-", "private_", "```", "http", "proj_", "run_",
            "task_", "st_", ":\\", "../", "=",
        ]
        .iter()
        .any(|s| lower.contains(s))
    {
        return fallback.into();
    }
    value
        .chars()
        .filter(|c| c.is_alphanumeric() || " .,:;!?()-&/’'".contains(*c))
        .take(72)
        .collect()
}
pub fn provider_name(id: &str) -> &'static str {
    match id {
        "codex" => "Codex",
        "claude-code" | "claude" => "Claude",
        "gemini-cli" | "gemini" => "Gemini",
        "cursor-cli" | "cursor" => "Cursor",
        "grok" => "Grok",
        "deepseek" => "DeepSeek",
        "ollama" => "Ollama",
        _ => "Swarm HQ",
    }
}
pub fn message(kind: &str, project: &str, task: &str, agent: &str, status: &str) -> String {
    let p = label(project, "your project");
    let t = label(task, "the assigned task");
    let a = provider_name(agent);
    match kind {
        "task_started" => format!("Zero, work has started on {p}. The planner is preparing the assignments; changes will wait for your review."),
        "agent_assigned" => format!("{a} is working on “{t}” for {p}. I'll report the result when it is ready."),
        "task_finished" => format!("{a} finished a proposal for “{t}” in {p}. It is ready for the reviewer; nothing has been applied."),
        "workflow_finished" if status == "reviewed" => format!("Zero, the reviewer accepted the proposal for {p}. Open The Swarm to inspect the files and test evidence, then decide whether to apply it."),
        "workflow_finished" => format!("The workflow for {p} has finished. Check the review outcome in The Swarm before deciding what to apply."),
        "project_attention" => format!("Zero, {p} needs attention. The reviewer requested changes. No files have been applied."),
        _ => format!("Zero, work on {p} is blocked. Check the provider or task error in The Swarm. No automatic API fallback or approval was used."),
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn messages_are_human_and_do_not_claim_tests_passed() {
        for kind in [
            "task_started",
            "agent_assigned",
            "task_finished",
            "workflow_finished",
            "project_attention",
            "task_failed",
        ] {
            let s = message(
                kind,
                "Pulse Desktop",
                "Layout check",
                "cursor-cli",
                "completed",
            );
            assert!(s.contains("Pulse Desktop"));
            assert!(!s.contains("tests passed"));
            assert!(!s.contains("run_"));
        }
    }
    #[test]
    fn sensitive_labels_fail_closed() {
        for s in [
            "sk-123456",
            "password=hello",
            "proj_private",
            "C:\\private",
            "hello\nworld",
            "```code",
        ] {
            assert_eq!(label(s, "project"), "project");
        }
    }
    #[test]
    fn actual_provider_is_attributed() {
        assert!(message(
            "task_finished",
            "Fixture",
            "Documentation",
            "ollama",
            "done"
        )
        .starts_with("Ollama"));
    }
}
