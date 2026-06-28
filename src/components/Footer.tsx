import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="border-t border-[rgba(0,255,170,0.08)] mt-20">
      <div className="container mx-auto px-4 py-10 grid md:grid-cols-4 gap-8 text-sm">
        <div>
          <div className="text-[#F4F6F8] font-bold mb-2">Narimon Ecosystem</div>
          <p className="text-[#97A2AE] leading-relaxed">
            AI texnologiyalari va xavfsiz raqamli muhit uchun yagona platforma.
          </p>
        </div>
        <div>
          <div className="text-[#F4F6F8] font-semibold mb-3">Mahsulot</div>
          <ul className="space-y-2 text-[#97A2AE]">
            <li><Link to="/ai" className="hover:text-[#00E58E]">Narimon AI</Link></li>
            <li><Link to="/browser" className="hover:text-[#00E58E]">Narimon Brauzer</Link></li>
            <li><Link to="/pricing" className="hover:text-[#00E58E]">Tariflar</Link></li>
          </ul>
        </div>
        <div>
          <div className="text-[#F4F6F8] font-semibold mb-3">Kompaniya</div>
          <ul className="space-y-2 text-[#97A2AE]">
            <li><Link to="/about" className="hover:text-[#00E58E]">Biz haqimizda</Link></li>
            <li><Link to="/about" className="hover:text-[#00E58E]">Yo'l xaritasi</Link></li>
          </ul>
        </div>
        <div>
          <div className="text-[#F4F6F8] font-semibold mb-3">Hisob</div>
          <ul className="space-y-2 text-[#97A2AE]">
            <li><Link to="/login" className="hover:text-[#00E58E]">Login</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-[rgba(0,255,170,0.06)] py-4 text-center text-xs text-[#97A2AE]">
        © {new Date().getFullYear()} Narimon Ecosystem. Barcha huquqlar himoyalangan.
      </div>
    </footer>
  );
}
