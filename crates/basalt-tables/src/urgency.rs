//! Urgency scoring for task management (ADR-048 §4.4).
//!
//! Composite score combining priority, due-date proximity, scheduled-date
//! proximity, and recurrence. Higher score = more urgent.

use chrono::NaiveDate;

use basalt_types::TaskData;

/// Calculate the urgency score for a task.
///
/// Score components:
/// - **Priority:** `(5 - numeric_rank) * 5` → 0–25 (highest priority = 25)
/// - **Due date proximity:** overdue 20–50, today 15, within 3d 10, within 7d 5
/// - **Scheduled date:** +5 if scheduled ≤ today
/// - **Recurring:** +2 if task has a recurrence rule
#[must_use]
pub fn calculate_urgency(task: &TaskData, today: NaiveDate) -> i32 {
    let mut score: i32 = 0;

    // Priority component (0–5 → score 0–25)
    score += (5 - task.priority.numeric() as i32) * 5;

    // Due date proximity
    if let Some(due) = task.due {
        let days_overdue = (today - due).num_days();
        if days_overdue > 0 {
            score += 20 + (days_overdue.min(30) as i32);
        } else if days_overdue == 0 {
            score += 15;
        } else if days_overdue >= -3 {
            score += 10;
        } else if days_overdue >= -7 {
            score += 5;
        }
    }

    // Scheduled date proximity
    if let Some(scheduled) = task.scheduled {
        if scheduled <= today {
            score += 5;
        }
    }

    // Recurring tasks get a small boost
    if task.recurrence.is_some() {
        score += 2;
    }

    score
}

#[cfg(test)]
mod tests {
    use super::*;
    use basalt_types::{TaskPriority, TaskStatus};
    use chrono::NaiveDate;

    fn make_task(
        priority: TaskPriority,
        due: Option<NaiveDate>,
        scheduled: Option<NaiveDate>,
        recurrence: Option<&str>,
    ) -> TaskData {
        TaskData {
            line: 1,
            description: "test".to_string(),
            status: TaskStatus::Todo,
            priority,
            created: None,
            scheduled,
            start: None,
            due,
            done: None,
            cancelled: None,
            recurrence: recurrence.map(String::from),
            recurrence_when_done: false,
            tags: vec![],
            id: None,
            depends_on: vec![],
            on_completion: None,
            span_start: 0,
            span_end: 10,
        }
    }

    #[test]
    fn urgency_highest_priority_no_dates() {
        let today = NaiveDate::from_ymd_opt(2024, 1, 15).unwrap();
        let task = make_task(TaskPriority::Highest, None, None, None);
        // priority: (5-0)*5 = 25, no dates, no recurrence
        assert_eq!(calculate_urgency(&task, today), 25);
    }

    #[test]
    fn urgency_lowest_priority_no_dates() {
        let today = NaiveDate::from_ymd_opt(2024, 1, 15).unwrap();
        let task = make_task(TaskPriority::Lowest, None, None, None);
        // priority: (5-5)*5 = 0
        assert_eq!(calculate_urgency(&task, today), 0);
    }

    #[test]
    fn urgency_due_today() {
        let today = NaiveDate::from_ymd_opt(2024, 1, 15).unwrap();
        let task = make_task(TaskPriority::None, Some(today), None, None);
        // priority: (5-3)*5 = 10, due today: +15 = 25
        assert_eq!(calculate_urgency(&task, today), 25);
    }

    #[test]
    fn urgency_due_overdue_3_days() {
        let today = NaiveDate::from_ymd_opt(2024, 1, 15).unwrap();
        let due = NaiveDate::from_ymd_opt(2024, 1, 12).unwrap();
        let task = make_task(TaskPriority::None, Some(due), None, None);
        // priority: 10, overdue 3 days: 20+3 = 23 → total 33
        assert_eq!(calculate_urgency(&task, today), 33);
    }

    #[test]
    fn urgency_due_overdue_capped() {
        let today = NaiveDate::from_ymd_opt(2024, 1, 15).unwrap();
        let due = NaiveDate::from_ymd_opt(2024, 1, 1).unwrap();
        let task = make_task(TaskPriority::None, Some(due), None, None);
        // priority: 10, overdue 14 days: 20+14 = 34 (min caps at 30 for ≥31 days)
        // total: 10 + 34 = 44
        assert_eq!(calculate_urgency(&task, today), 44);
    }

    #[test]
    fn urgency_due_within_3_days_future() {
        let today = NaiveDate::from_ymd_opt(2024, 1, 15).unwrap();
        let due = NaiveDate::from_ymd_opt(2024, 1, 17).unwrap();
        let task = make_task(TaskPriority::None, Some(due), None, None);
        // priority: 10, due in 2 days: +10 = 20
        assert_eq!(calculate_urgency(&task, today), 20);
    }

    #[test]
    fn urgency_due_within_7_days_future() {
        let today = NaiveDate::from_ymd_opt(2024, 1, 15).unwrap();
        let due = NaiveDate::from_ymd_opt(2024, 1, 20).unwrap();
        let task = make_task(TaskPriority::None, Some(due), None, None);
        // priority: 10, due in 5 days: +5 = 15
        assert_eq!(calculate_urgency(&task, today), 15);
    }

    #[test]
    fn urgency_scheduled_today() {
        let today = NaiveDate::from_ymd_opt(2024, 1, 15).unwrap();
        let task = make_task(TaskPriority::None, None, Some(today), None);
        // priority: 10, scheduled today: +5 = 15
        assert_eq!(calculate_urgency(&task, today), 15);
    }

    #[test]
    fn urgency_recurring() {
        let today = NaiveDate::from_ymd_opt(2024, 1, 15).unwrap();
        let task = make_task(TaskPriority::None, None, None, Some("every week"));
        // priority: 10, recurring: +2 = 12
        assert_eq!(calculate_urgency(&task, today), 12);
    }

    #[test]
    fn urgency_all_components() {
        let today = NaiveDate::from_ymd_opt(2024, 1, 15).unwrap();
        let due = NaiveDate::from_ymd_opt(2024, 1, 14).unwrap();
        let scheduled = NaiveDate::from_ymd_opt(2024, 1, 15).unwrap();
        let task = make_task(
            TaskPriority::High,
            Some(due),
            Some(scheduled),
            Some("every day"),
        );
        // priority: (5-1)*5 = 20, overdue 1 day: 20+1 = 21, scheduled today: +5, recurring: +2
        // total: 20 + 21 + 5 + 2 = 48
        assert_eq!(calculate_urgency(&task, today), 48);
    }

    #[test]
    fn urgency_nothing_due_far_future() {
        let today = NaiveDate::from_ymd_opt(2024, 1, 15).unwrap();
        let due = NaiveDate::from_ymd_opt(2024, 2, 15).unwrap();
        let task = make_task(TaskPriority::None, Some(due), None, None);
        // priority: 10, due in 31 days: no proximity bonus
        assert_eq!(calculate_urgency(&task, today), 10);
    }
}
