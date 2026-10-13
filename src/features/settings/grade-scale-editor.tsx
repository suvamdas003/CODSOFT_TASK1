"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox, Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { gradeScaleSchema } from "@/lib/validation/exams";
import { saveGradeScaleAction } from "./actions";

type Values = z.input<typeof gradeScaleSchema>;

export type GradeScaleDraft = {
  id: string | null;
  name: string;
  description: string;
  isDefault: boolean;
  bands: { label: string; minPercent: string; gradePoint: string; remark: string; isPassing: boolean }[];
};

/** Create or edit a configurable grade scale (bands: label + minimum percentage). */
export function GradeScaleEditor({ scale, triggerLabel }: { scale: GradeScaleDraft; triggerLabel: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, control, handleSubmit, formState } = useForm<Values>({
    resolver: zodResolver(gradeScaleSchema, undefined, { raw: true }),
    defaultValues: { name: scale.name, description: scale.description, isDefault: scale.isDefault, bands: scale.bands },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "bands" });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const result = await saveGradeScaleAction(scale.id, values);
    if (!result.ok) {
      setServerError(result.fieldErrors?.bands?.join(" ") ?? result.error);
      toast.error(result.error);
      return;
    }
    toast.success(result.message ?? "Saved.");
    setOpen(false);
    router.refresh();
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={scale.id ? "outline" : "default"} size="sm">
          {scale.id ? null : <PlusIcon aria-hidden />}
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{scale.id ? `Edit ${scale.name}` : "New grade scale"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {serverError ? <Alert variant="destructive">{serverError}</Alert> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="scale-name">Name</Label>
              <Input
                id="scale-name"
                maxLength={60}
                aria-invalid={Boolean(formState.errors.name)}
                {...register("name")}
              />
              {formState.errors.name ? (
                <p className="text-destructive text-xs">{formState.errors.name.message}</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="scale-desc">Description</Label>
              <Input id="scale-desc" maxLength={200} {...register("description")} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox {...register("isDefault")} /> Default scale for new exams
          </label>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">
              Bands (a grade applies from its minimum % up to the next band)
            </legend>
            <div className="text-muted-foreground hidden grid-cols-[5rem_6rem_6rem_1fr_5rem_2.25rem] gap-2 text-xs sm:grid">
              <span>Label</span>
              <span>Min %</span>
              <span>Grade pt.</span>
              <span>Remark</span>
              <span>Passing</span>
              <span />
            </div>
            {fields.map((field, i) => (
              <div
                key={field.id}
                className="grid grid-cols-2 gap-2 sm:grid-cols-[5rem_6rem_6rem_1fr_5rem_2.25rem] sm:items-center"
              >
                <Input aria-label={`Band ${i + 1} label`} maxLength={8} {...register(`bands.${i}.label`)} />
                <Input
                  aria-label={`Band ${i + 1} minimum percent`}
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  {...register(`bands.${i}.minPercent`)}
                />
                <Input
                  aria-label={`Band ${i + 1} grade point`}
                  type="number"
                  min={0}
                  max={10}
                  step="0.01"
                  {...register(`bands.${i}.gradePoint`)}
                />
                <Input aria-label={`Band ${i + 1} remark`} maxLength={60} {...register(`bands.${i}.remark`)} />
                <label className="flex items-center gap-2 text-sm sm:justify-center">
                  <Checkbox {...register(`bands.${i}.isPassing`)} />
                  <span className="sm:sr-only">Passing</span>
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(i)}
                  disabled={fields.length === 1}
                  aria-label={`Remove band ${i + 1}`}
                >
                  <Trash2Icon />
                </Button>
              </div>
            ))}
            {formState.errors.bands ? (
              <p className="text-destructive text-xs">
                Check the band values: labels are required and minimums must be 0–100.
              </p>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => append({ label: "", minPercent: "0", gradePoint: "", remark: "", isPassing: true })}
              disabled={fields.length >= 20}
            >
              <PlusIcon aria-hidden /> Add band
            </Button>
          </fieldset>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={formState.isSubmitting}>
              {formState.isSubmitting ? <Loader2Icon className="animate-spin" aria-hidden /> : null}
              Save scale
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
