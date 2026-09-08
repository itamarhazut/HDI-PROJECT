import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui";

interface StubPageProps {
  title: string;
  description?: string;
}

// Placeholder for a module page — Phase 0 wires up navigation and routing
// for every module; real CRUD screens land in Phase 1 (see the project plan).
export function StubPage({ title, description }: StubPageProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground">
        {description ?? "המסך הזה ייבנה בשלב הבא (MVP)."}
      </CardContent>
    </Card>
  );
}
