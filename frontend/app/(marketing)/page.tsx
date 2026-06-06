import Hero from "@/components/landing/Hero";
import HowItWorks from "@/components/landing/HowItWorks";
import WhyCouncil from "@/components/landing/WhyCouncil";
import ProductPeek from "@/components/landing/ProductPeek";
import Byok from "@/components/landing/Byok";
import FAQ from "@/components/landing/FAQ";
import FinalCTA from "@/components/landing/FinalCTA";

export default function LandingPage() {
  return (
    <main>
      <Hero />
      <HowItWorks />
      <WhyCouncil />
      <ProductPeek />
      <Byok />
      <FAQ />
      <FinalCTA />
    </main>
  );
}
