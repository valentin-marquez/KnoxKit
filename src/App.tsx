import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Shared placeholder shown by routes that have no real content yet.
 * App-level building block; not a route itself.
 */
export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{description ?? "Nothing here yet."}</p>
        </CardContent>
      </Card>
    </div>
  );
}
