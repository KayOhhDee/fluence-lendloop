import { SignIn } from "@clerk/nextjs";
import { Logo } from "@/components/ui";

export default function SignInPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
      <Logo />
      <SignIn fallbackRedirectUrl="/tools" />
    </main>
  );
}
