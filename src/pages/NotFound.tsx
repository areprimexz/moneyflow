import { useNavigate } from "react-router";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <Card>
      <EmptyState icon={<Compass className="h-5 w-5" />} title="Page not found" description="The page you requested does not exist." action={<Button variant="primary" onClick={() => navigate("/")}>Go to overview</Button>} />
    </Card>
  );
}
