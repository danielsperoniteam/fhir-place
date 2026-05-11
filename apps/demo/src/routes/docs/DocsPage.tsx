import { useMemo } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CC_FONT, CC_MONO } from "../../components/ccStyles.js";
import {
  DEFAULT_DOC_SLUG,
  DOC_CATEGORIES,
  DOCS,
  findDoc,
  type DocEntry,
} from "./manifest.js";

const REPO_BLOB_BASE =
  "https://github.com/danielsperoniteam/fhir-place/blob/main/";

export function DocsPage() {
  const { slug } = useParams<{ slug?: string }>();
  const effectiveSlug = slug ?? DEFAULT_DOC_SLUG;
  const doc = findDoc(effectiveSlug);

  const grouped = useMemo(() => {
    const out = new Map<string, DocEntry[]>();
    for (const d of DOCS) {
      const list = out.get(d.category) ?? [];
      list.push(d);
      out.set(d.category, list);
    }
    return out;
  }, []);

  if (!slug) {
    return <Navigate to={`/docs/${DEFAULT_DOC_SLUG}`} replace />;
  }

  if (!doc) {
    return (
      <div
        data-testid="docs-page"
        style={{
          display: "flex",
          flexDirection: "column",
          padding: 32,
          gap: 12,
          fontFamily: CC_FONT,
        }}
      >
        <div data-testid="docs-not-found" style={{ fontSize: 16, color: "var(--text)" }}>
          Doc not found: <code style={{ fontFamily: CC_MONO }}>{slug}</code>
        </div>
        <Link
          to={`/docs/${DEFAULT_DOC_SLUG}`}
          style={{ color: "var(--accent-text)", fontSize: 13 }}
        >
          ← Back to docs
        </Link>
      </div>
    );
  }

  return (
    <div
      data-testid="docs-page"
      className="docs-page"
      style={{
        display: "flex",
        height: "100%",
        fontFamily: CC_FONT,
        color: "var(--text)",
        background: "var(--bg)",
      }}
    >
      <DocsSidebar grouped={grouped} activeSlug={doc.slug} />
      <DocsContent doc={doc} />
    </div>
  );
}

function DocsSidebar({
  grouped,
  activeSlug,
}: {
  grouped: Map<string, DocEntry[]>;
  activeSlug: string;
}) {
  return (
    <aside
      data-testid="docs-toc"
      style={{
        width: 240,
        borderRight: "1px solid var(--border)",
        background: "var(--surface)",
        padding: "16px 8px 24px",
        overflowY: "auto",
        flexShrink: 0,
      }}
    >
      {DOC_CATEGORIES.map((category) => {
        const entries = grouped.get(category);
        if (!entries || entries.length === 0) return null;
        return (
          <div key={category} style={{ marginBottom: 16 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: "var(--text-subtle)",
                letterSpacing: 0.6,
                textTransform: "uppercase",
                padding: "4px 10px 6px",
              }}
            >
              {category}
            </div>
            {entries.map((entry) => {
              const isActive = entry.slug === activeSlug;
              return (
                <Link
                  key={entry.slug}
                  to={`/docs/${entry.slug}`}
                  data-testid={`docs-toc-link-${entry.slug}`}
                  style={{
                    display: "block",
                    padding: "5px 10px",
                    borderRadius: 6,
                    background: isActive ? "var(--accent-soft)" : "transparent",
                    color: isActive ? "var(--accent-text)" : "var(--text)",
                    fontSize: 13,
                    fontWeight: isActive ? 600 : 400,
                    textDecoration: "none",
                    marginBottom: 1,
                    lineHeight: 1.35,
                  }}
                >
                  {entry.title}
                </Link>
              );
            })}
          </div>
        );
      })}
    </aside>
  );
}

function DocsContent({ doc }: { doc: DocEntry }) {
  return (
    <div
      data-testid="docs-content"
      style={{
        flex: 1,
        overflowY: "auto",
        padding: "24px clamp(20px, 5vw, 48px) 64px",
        minWidth: 0,
      }}
    >
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: 16,
            paddingBottom: 12,
            marginBottom: 20,
            borderBottom: "1px solid var(--border)",
          }}
        >
          <span
            data-testid="docs-source-path"
            style={{
              fontSize: 11,
              color: "var(--text-subtle)",
              fontFamily: CC_MONO,
            }}
          >
            {doc.source}
          </span>
          <a
            href={`${REPO_BLOB_BASE}${doc.source}`}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="docs-edit-on-github"
            style={{
              fontSize: 11,
              color: "var(--accent-text)",
              textDecoration: "none",
              fontFamily: CC_MONO,
            }}
          >
            View on GitHub ↗
          </a>
        </div>
        <article className="docs-markdown">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={MARKDOWN_COMPONENTS}
          >
            {doc.content}
          </ReactMarkdown>
        </article>
      </div>
    </div>
  );
}

const MARKDOWN_COMPONENTS = {
  h1: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h1
      data-testid="docs-h1"
      style={{
        fontSize: 28,
        fontWeight: 700,
        margin: "0 0 16px",
        color: "var(--text)",
        lineHeight: 1.2,
      }}
      {...props}
    />
  ),
  h2: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2
      style={{
        fontSize: 20,
        fontWeight: 600,
        margin: "28px 0 12px",
        color: "var(--text)",
        lineHeight: 1.3,
        borderBottom: "1px solid var(--border)",
        paddingBottom: 6,
      }}
      {...props}
    />
  ),
  h3: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3
      style={{
        fontSize: 16,
        fontWeight: 600,
        margin: "20px 0 8px",
        color: "var(--text)",
        lineHeight: 1.35,
      }}
      {...props}
    />
  ),
  h4: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h4
      style={{
        fontSize: 14,
        fontWeight: 600,
        margin: "16px 0 6px",
        color: "var(--text)",
      }}
      {...props}
    />
  ),
  p: (props: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p
      style={{
        margin: "0 0 12px",
        lineHeight: 1.6,
        fontSize: 14,
        color: "var(--text)",
      }}
      {...props}
    />
  ),
  ul: (props: React.HTMLAttributes<HTMLUListElement>) => (
    <ul
      style={{
        margin: "0 0 12px",
        paddingLeft: 22,
        lineHeight: 1.6,
        fontSize: 14,
      }}
      {...props}
    />
  ),
  ol: (props: React.HTMLAttributes<HTMLOListElement>) => (
    <ol
      style={{
        margin: "0 0 12px",
        paddingLeft: 22,
        lineHeight: 1.6,
        fontSize: 14,
      }}
      {...props}
    />
  ),
  li: (props: React.LiHTMLAttributes<HTMLLIElement>) => (
    <li style={{ margin: "2px 0" }} {...props} />
  ),
  a: ({ href, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
    const target = mapDocLink(href);
    if (target) {
      return (
        <Link
          to={target}
          style={{ color: "var(--accent-text)", textDecoration: "underline" }}
          {...(rest as React.HTMLAttributes<HTMLElement>)}
        />
      );
    }
    const external = href && /^https?:\/\//i.test(href);
    return (
      <a
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        style={{ color: "var(--accent-text)", textDecoration: "underline" }}
        {...rest}
      />
    );
  },
  code: ({
    className,
    children,
    ...rest
  }: React.HTMLAttributes<HTMLElement>) => {
    const isBlock = typeof className === "string" && className.startsWith("language-");
    if (isBlock) {
      return (
        <code className={className} style={{ fontFamily: CC_MONO, fontSize: 12.5 }} {...rest}>
          {children}
        </code>
      );
    }
    return (
      <code
        style={{
          fontFamily: CC_MONO,
          fontSize: 12.5,
          background: "var(--sunken)",
          border: "1px solid var(--border)",
          borderRadius: 4,
          padding: "0 4px",
        }}
        {...rest}
      >
        {children}
      </code>
    );
  },
  pre: (props: React.HTMLAttributes<HTMLPreElement>) => (
    <pre
      style={{
        background: "var(--sunken)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        padding: 12,
        overflowX: "auto",
        fontSize: 12.5,
        lineHeight: 1.5,
        margin: "0 0 14px",
      }}
      {...props}
    />
  ),
  blockquote: (props: React.HTMLAttributes<HTMLQuoteElement>) => (
    <blockquote
      style={{
        borderLeft: "3px solid var(--border-strong, var(--border))",
        margin: "0 0 14px",
        padding: "4px 12px",
        color: "var(--text-muted)",
        fontStyle: "italic",
      }}
      {...props}
    />
  ),
  table: (props: React.HTMLAttributes<HTMLTableElement>) => (
    <div style={{ overflowX: "auto", marginBottom: 14 }}>
      <table
        style={{
          borderCollapse: "collapse",
          fontSize: 13,
          width: "100%",
        }}
        {...props}
      />
    </div>
  ),
  th: (props: React.ThHTMLAttributes<HTMLTableCellElement>) => (
    <th
      style={{
        textAlign: "left",
        padding: "6px 10px",
        borderBottom: "1px solid var(--border)",
        background: "var(--surface)",
        fontWeight: 600,
      }}
      {...props}
    />
  ),
  td: (props: React.TdHTMLAttributes<HTMLTableCellElement>) => (
    <td
      style={{
        padding: "6px 10px",
        borderBottom: "1px solid var(--border)",
      }}
      {...props}
    />
  ),
  hr: () => (
    <hr
      style={{
        border: "none",
        borderTop: "1px solid var(--border)",
        margin: "20px 0",
      }}
    />
  ),
};

/**
 * Map an in-repo markdown link to a /docs/:slug route when we render that
 * file in the docs viewer; return null for everything else so the default
 * anchor handling runs.
 */
function mapDocLink(href: string | undefined): string | null {
  if (!href) return null;
  if (/^https?:\/\//i.test(href)) return null;
  if (href.startsWith("#")) return null;

  const cleaned = href.replace(/^\.\//, "").split("#")[0]?.split("?")[0];
  if (!cleaned) return null;

  const match = DOCS.find((d) => d.source === cleaned || d.source.endsWith(`/${cleaned}`));
  return match ? `/docs/${match.slug}` : null;
}
