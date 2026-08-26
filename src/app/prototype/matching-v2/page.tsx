import { notFound } from "next/navigation";
import MatchingV2PrototypeClient from "./MatchingV2PrototypeClient";

export default function MatchingV2PrototypePage() {
  if (process.env.NODE_ENV === "production") notFound();

  return <MatchingV2PrototypeClient />;
}
