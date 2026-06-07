import "./landing.css";

const LINKEDIN_URL =
  process.env.NEXT_PUBLIC_AUTHOR_LINKEDIN_URL ||
  "https://www.linkedin.com/in/nadvolod/";
const GITHUB_URL =
  process.env.NEXT_PUBLIC_GITHUB_REPO_URL ||
  "https://github.com/nadvolod/llm-council";

const VIBE_WARNING =
  "Vibe Code Alert: this project was 99% vibe coded as a fun hack. " +
  "It is provided as-is, for inspiration, with no support or warranty.";

export default function Footer() {
  return (
    <footer className="landing-footer">
      <div className="landing-footer-inner">
        <p className="landing-footer-credit">
          Built by{" "}
          <a href={LINKEDIN_URL} target="_blank" rel="noopener noreferrer">
            Nikolay Advolodkin
          </a>
        </p>
        <p className="landing-footer-links">
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
            GitHub repo
          </a>
        </p>
        <p className="landing-footer-warning">{VIBE_WARNING}</p>
      </div>
    </footer>
  );
}
