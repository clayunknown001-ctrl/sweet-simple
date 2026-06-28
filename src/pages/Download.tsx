import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Download as DownloadIcon, ArrowLeft } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const labels: Record<string, string> = {
  windows: "Windows",
  macos: "macOS",
  android: "Android",
  ios: "iOS",
};

export default function Download() {
  const { platform = "" } = useParams();
  const label = labels[platform] ?? platform;

  return (
    <div className="min-h-screen bg-[#050607] text-[#F4F6F8] flex flex-col">
      <Navbar />
      <main className="flex-1 flex items-center justify-center px-4 pt-28 pb-12">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-lg w-full text-center rounded-2xl border border-[rgba(0,255,170,0.15)] bg-[#0B1015] p-10"
        >
          <div className="mx-auto w-16 h-16 rounded-2xl bg-[#00E58E]/10 flex items-center justify-center mb-5">
            <DownloadIcon className="w-7 h-7 text-[#00E58E]" />
          </div>
          <h1 className="text-2xl font-bold">Narimon Brauzer — {label}</h1>
          <p className="mt-3 text-[#97A2AE]">
            {label} uchun yuklab olish hozircha tayyorlanmoqda. Tez orada bu yerda mavjud bo'ladi.
          </p>
          <Link to="/browser" className="mt-6 inline-flex items-center gap-2 text-sm text-[#00E58E] hover:underline">
            <ArrowLeft className="w-4 h-4" /> Brauzer sahifasiga qaytish
          </Link>
        </motion.div>
      </main>
      <Footer />
    </div>
  );
}
