import { Providers } from "@/app/providers";
import { OutingQualityScreen } from "@/features/admin/OutingQualityScreen";
export const metadata = { title: "나들이 품질 | Tuti 운영 센터", robots: { index: false, follow: false } };
export default function Page() { return <Providers><OutingQualityScreen /></Providers>; }
