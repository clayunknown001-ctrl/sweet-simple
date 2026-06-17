import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const schema = z.object({
  email: z.string().trim().email("Invalid email").max(255),
  message: z.string().trim().min(3, "Too short").max(1000),
});

export default function FeedbackWidget() {
  const { user } = useAuth();
  const [email, setEmail] = useState(user?.email ?? "");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ email, message });
    if (!parsed.success) return toast.error(parsed.error.errors[0].message);
    if (!user) return toast.error("Please sign in to submit feedback");

    setBusy(true);
    try {
      const { error } = await supabase.from("feedback").insert({
        user_id: user.id,
        user_email: parsed.data.email,
        message: parsed.data.message,
      });
      if (error) toast.error(error.message);
      else {
        toast.success("Feedback submitted. Thank you!");
        setMessage("");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="max-w-xl">
      <CardHeader><CardTitle>Send Feedback</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-3">
          <Input
            type="email"
            placeholder="Your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Textarea
            placeholder="Tell us what's on your mind…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            required
          />
          <Button type="submit" disabled={busy}>
            {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Submit
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
