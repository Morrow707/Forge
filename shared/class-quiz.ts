// Shared between server/storage.ts (real grading, submitClassLessonQuiz)
// and the lesson reader's preview mode (client/src/components/
// class-lesson-reader-dialog.tsx, admin/coach previewing an unsaved lesson
// with no server round-trip) -- one number, so a preview quiz's pass/fail
// can never drift from what a real athlete submission would score.
export const CLASS_QUIZ_PASS_THRESHOLD = 0.8;
