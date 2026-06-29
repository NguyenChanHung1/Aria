import { SongCreator } from "@/components/SongCreator";
import styles from "./page.module.css";

const AGENT_URL = process.env.AGENT_API_URL ?? "http://localhost:8000";

export default function HomePage() {
  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroBadge}>AI song studio for everyone</div>
        <h1>Aria</h1>
        <p>
          Describe your song in everyday words. Aria handles planning,
          lyrics, composition, and mixing — no music theory required.
        </p>
      </header>
      <SongCreator agentUrl={AGENT_URL} />
    </main>
  );
}
