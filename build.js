const { Client } = require("@notionhq/client");
const fs = require("fs");
const path = require("path");

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DATA_SOURCE_ID = "c21bec7f-3673-4671-acfd-0f439fbc1bc3";

if (!NOTION_TOKEN) {
  console.error("NOTION_TOKEN 環境変数が設定されていません");
  process.exit(1);
}

const notion = new Client({ auth: NOTION_TOKEN });

async function fetchAllContent() {
  const map = {};
  let cursor;
  do {
    const res = await notion.dataSources.query({
      data_source_id: DATA_SOURCE_ID,
      start_cursor: cursor,
      page_size: 100,
    });
    for (const page of res.results) {
      const key = page.properties.Key?.title?.[0]?.plain_text;
      const segments = page.properties.Content?.rich_text || [];
      // Concatenate all rich_text segments, preserving bold annotations as **text**
      let content = "";
      for (const seg of segments) {
        const t = seg.plain_text || "";
        if (seg.annotations?.bold) {
          content += "**" + t + "**";
        } else {
          content += t;
        }
      }
      if (key) {
        map[key] = content;
      }
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return map;
}

function formatContent(key, raw) {
  // hero_sub: convert \n to <br>\n and **text** to <strong> with accent
  if (key === "hero_sub") {
    return raw
      .replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--accent);">$1</strong>')
      .replace(/\n/g, "<br>\n      ");
  }
  // ba_bottom_note: wrap **text** with <strong>
  if (key === "ba_bottom_note") {
    return raw.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  }
  // point descriptions: convert \n to <br>\n
  if (key.match(/^point_\d\d_desc$/) || key === "ai_desc") {
    return raw.replace(/\n/g, "<br>\n        ");
  }
  // mid_cta_text: convert \n to <br>
  if (key === "mid_cta_text") {
    return raw.replace(/\n/g, "<br>");
  }
  // hero_title: convert \n to <br>
  if (key === "hero_title" || key.startsWith("point_0") && key.endsWith("_title") && !key.startsWith("point_card")) {
    return raw.replace(/\n/g, "<br>");
  }
  // ai_title: convert \n to <br>
  if (key === "ai_title") {
    return raw.replace(/\n/g, "<br>");
  }
  return raw;
}

async function build() {
  console.log("Fetching content from Notion...");
  const content = await fetchAllContent();
  console.log(`  ${Object.keys(content).length} items fetched`);

  const templatePath = path.join(__dirname, "template.html");
  const outputPath = path.join(__dirname, "index.html");

  let html = fs.readFileSync(templatePath, "utf8");

  let replaced = 0;
  for (const [key, raw] of Object.entries(content)) {
    const placeholder = `{{${key}}}`;
    if (html.includes(placeholder)) {
      html = html.replaceAll(placeholder, formatContent(key, raw));
      replaced++;
    }
  }

  fs.writeFileSync(outputPath, html, "utf8");
  console.log(`  ${replaced} placeholders replaced → index.html`);
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
