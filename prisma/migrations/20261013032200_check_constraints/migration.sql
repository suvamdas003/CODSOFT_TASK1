-- Database-level invariants that Prisma's schema language cannot express.
-- Prisma does not manage CHECK constraints, so future migrations will not drop them.

-- Institution settings is a single-row table.
ALTER TABLE "institution_settings"
  ADD CONSTRAINT "institution_settings_single_row" CHECK ("id" = 1),
  ADD CONSTRAINT "institution_settings_threshold_range" CHECK ("lowAttendanceThreshold" BETWEEN 0 AND 100);

ALTER TABLE "academic_sessions"
  ADD CONSTRAINT "academic_sessions_date_order" CHECK ("endDate" > "startDate");

ALTER TABLE "sections"
  ADD CONSTRAINT "sections_capacity_positive" CHECK ("capacity" IS NULL OR "capacity" > 0);

ALTER TABLE "grade_bands"
  ADD CONSTRAINT "grade_bands_min_percent_range" CHECK ("minPercent" >= 0 AND "minPercent" <= 100);

-- Examinations: positive maximums, pass marks within range, marks within maximum.
ALTER TABLE "exam_subjects"
  ADD CONSTRAINT "exam_subjects_max_marks_positive" CHECK ("maxMarks" > 0),
  ADD CONSTRAINT "exam_subjects_pass_marks_range" CHECK ("passMarks" >= 0 AND "passMarks" <= "maxMarks");

ALTER TABLE "marks"
  ADD CONSTRAINT "marks_non_negative" CHECK ("marksObtained" IS NULL OR "marksObtained" >= 0),
  ADD CONSTRAINT "marks_absent_has_no_score" CHECK (NOT ("isAbsent" AND "marksObtained" IS NOT NULL)),
  ADD CONSTRAINT "marks_present_has_score" CHECK ("isAbsent" OR "marksObtained" IS NOT NULL);

ALTER TABLE "exams"
  ADD CONSTRAINT "exams_date_order" CHECK ("startDate" IS NULL OR "endDate" IS NULL OR "endDate" >= "startDate");

-- Fees and payments: amounts in minor units are never negative and payments never exceed totals.
ALTER TABLE "fee_structures"
  ADD CONSTRAINT "fee_structures_amount_positive" CHECK ("amountMinor" > 0);

ALTER TABLE "invoice_items"
  ADD CONSTRAINT "invoice_items_amount_positive" CHECK ("amountMinor" > 0);

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_total_positive" CHECK ("totalMinor" > 0),
  ADD CONSTRAINT "invoices_paid_range" CHECK ("paidMinor" >= 0 AND "paidMinor" <= "totalMinor"),
  ADD CONSTRAINT "invoices_due_after_issue" CHECK ("dueDate" >= "issueDate");

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_positive" CHECK ("amountMinor" > 0);
