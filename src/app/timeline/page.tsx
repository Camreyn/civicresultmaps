import { permanentRedirect } from "next/navigation";

export default function TimelineRedirectPage() {
  permanentRedirect("/evidence");
}
