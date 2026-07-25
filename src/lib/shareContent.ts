type ShareContent = {
  text: string;
  title: string;
  url?: string;
};

export async function shareContent(content: ShareContent) {
  if (navigator.share) {
    try {
      await navigator.share(content);
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
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
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = fallbackText;
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.append(textArea);
  textArea.select();
  document.execCommand("copy");
  textArea.remove();
}
