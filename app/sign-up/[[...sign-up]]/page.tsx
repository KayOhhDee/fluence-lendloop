import { SignUp } from "@clerk/nextjs";
import { Logo } from "@/components/ui";

export default function SignUpPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
      <Logo />
      <SignUp fallbackRedirectUrl="/tools" />
    </main>
  );
}
