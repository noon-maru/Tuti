type ShareContent = {
  text: string;
  title: string;
  url?: string;
};

export async function shareContent(content: ShareContent) {
  if (navigator.share) {
    try {
      await navigator.share(content);
      return "shared" as const;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return "cancelled" as const;
      }
    }
  }

  const fallbackText = [
    content.title,
    content.text,
    content.url,
  ]
    .filter(Boolean)
    .join("\n");

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
  document.execCommand("copy");
  textArea.remove();
  return "copied" as const;
}
