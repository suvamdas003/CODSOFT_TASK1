import { SearchIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";

/**
 * Search and filter controls as a plain GET form: works without JavaScript, keeps
 * state in the URL (shareable, back-button friendly) and resets pagination on submit.
 */
export function FilterBar({ basePath, children }: { basePath: string; children: ReactNode }) {
  return (
    <form
      method="get"
      action={basePath}
      className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end"
      role="search"
    >
      {children}
      <div className="flex gap-2">
        <Button type="submit" variant="secondary">
          <SearchIcon aria-hidden /> Apply
        </Button>
        <Button asChild variant="ghost">
          <Link href={basePath}>Reset</Link>
        </Button>
      </div>
    </form>
  );
}

export function FilterSearch({
  defaultValue,
  placeholder = "Search…",
}: {
  defaultValue?: string;
  placeholder?: string;
}) {
  return (
    <label className="flex-1 sm:min-w-56">
      <span className="sr-only">Search</span>
      <Input type="search" name="q" defaultValue={defaultValue} placeholder={placeholder} maxLength={100} />
    </label>
  );
}

export function FilterSelect({
  name,
  label,
  defaultValue,
  options,
  allLabel = "All",
}: {
  name: string;
  label: string;
  defaultValue?: string;
  options: { value: string; label: string }[];
  allLabel?: string;
}) {
  return (
    <label className="sm:w-48">
      <span className="sr-only">{label}</span>
      <NativeSelect name={name} defaultValue={defaultValue ?? ""} aria-label={label}>
        <option value="">{`${label}: ${allLabel}`}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </NativeSelect>
    </label>
  );
}
