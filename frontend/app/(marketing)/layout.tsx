import Link from "next/link";
import {
  SignedIn,
  SignedOut,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
import "@/components/landing/landing.css";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="landing">
      <nav className="landing-nav">
        <Link href="/" className="landing-nav-logo">
          LLM Council
        </Link>
        <div className="landing-nav-actions">
          <SignedOut>
            <SignInButton mode="redirect">
              <button className="landing-btn">Sign in</button>
            </SignInButton>
            <SignUpButton mode="redirect">
              <button className="landing-btn landing-btn-primary">
                Sign up
              </button>
            </SignUpButton>
          </SignedOut>
          <SignedIn>
            <Link href="/app" className="landing-btn landing-btn-primary">
              Open app
            </Link>
            <UserButton afterSignOutUrl="/" />
          </SignedIn>
        </div>
      </nav>
      {children}
    </div>
  );
}
