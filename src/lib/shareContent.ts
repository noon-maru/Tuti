type ShareContent = {
  text: string;
  title: string;
  url?: string;
};

/** Keep the URL on its own final line; share targets concatenate separate text/url fields differently. */
export function createLinkShareContent(content: ShareContent & { url: string }) {
  const title = content.title.trim();
  return { title, text: [title, content.text.trim(), content.url.trim()].filter(Boolean).join("\n\n") };
}

export async function shareContent(content: ShareContent) {
  const payload = content.url ? createLinkShareContent({ ...content, url: content.url }) : content;
  if (navigator.share) {
    try {
      await navigator.share(payload);
      return "shared" as const;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return "cancelled" as const;
      }
    }
  }

  const fallbackText = payload.text === payload.title || payload.text.startsWith(`${payload.title}\n`)
    ? payload.text : [payload.title, payload.text].filter(Boolean).join("\n");

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(fallbackText);
    return "copied" as const;
  }

  const textArea = document.createElement("textarea");
  textArea.value = fallbackText;
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.append(textArea);
  textArea.select();
  const copied = document.execCommand("copy");
  textArea.remove();
  if (!copied) throw new Error("링크를 복사하지 못했어요. 다시 눌러주세요.");
  return "copied" as const;
}
