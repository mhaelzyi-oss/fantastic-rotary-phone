import { openToolPage, toolPageUrl, webTools } from "../../shared/webTools";
import styles from "../finder.module.css";

type Props = { compact: boolean };

export function ToolsPanel({ compact }: Props) {
  return (
    <div className={compact ? styles.toolLinks : styles.toolGrid} data-testid="tools-panel">
      <p className={styles.toolLead}>Local files you pick. Nothing is uploaded.</p>
      {webTools.map((tool) => (
        <a
          key={tool.slug}
          className={compact ? styles.toolChip : styles.toolCard}
          href={toolPageUrl(tool.slug)}
          title={tool.summary}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
            e.preventDefault();
            openToolPage(tool.slug);
          }}
        >
          {compact ? (
            <span>{tool.short}</span>
          ) : (
            <>
              <p className={styles.toolKicker}>{tool.kicker}</p>
              <h3 className={styles.toolName}>{tool.name}</h3>
              <p className={styles.toolSummary}>{tool.summary}</p>
            </>
          )}
        </a>
      ))}
    </div>
  );
}
