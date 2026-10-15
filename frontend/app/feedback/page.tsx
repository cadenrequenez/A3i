import { redirect } from "next/navigation";

export default function FeedbackPage() {
  redirect("/?section=requests");
}
