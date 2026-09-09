import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TutiAppShell } from "@/features/tuti/components/TutiAppShell";
import { PublicPlaceFlow } from "@/features/tuti/flows/PublicPlaceFlow";
import { findPublicPlace } from "@/server/places/publicPlace";

export const dynamic = "force-dynamic";

type PublicPlacePageProps = {
  params: Promise<{ placeId: string }>;
};

export async function generateMetadata({
  params,
}: PublicPlacePageProps): Promise<Metadata> {
  const { placeId } = await params;
  const place = await findPublicPlace(placeId);

  if (!place) {
    return {
      title: "공간을 찾지 못했어요 | Tuti",
      robots: { index: false, follow: false },
    };
  }

  const description = place.phrase || place.note;
  return {
    title: `${place.name} | Tuti`,
    description,
    robots: { index: false, follow: true },
    openGraph: {
      type: "website",
      title: place.name,
      description,
      images: place.image
        ? [{ url: place.image, alt: `${place.name} 풍경` }]
        : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: place.name,
      description,
      images: place.image ? [place.image] : undefined,
    },
  };
}

export default async function PublicPlacePage({
  params,
}: PublicPlacePageProps) {
  const { placeId } = await params;
  const place = await findPublicPlace(placeId);
  if (!place) notFound();

  return (
    <TutiAppShell>
      <PublicPlaceFlow place={place} />
    </TutiAppShell>
  );
}
