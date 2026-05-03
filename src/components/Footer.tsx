import { Link } from "react-router-dom"

const footerLinks = [
  { label: "ფრილანსერები", to: "/browse" },
  { label: "ლისტინგები", to: "/listings" },
  { label: "სამუშაოები", to: "/jobs" },
  { label: "დამქირავებლები", to: "/hirers" },
  { label: "შესვლა", to: "/login" },
]

export default function Footer() {
  const year = new Date().getFullYear()
  return (
    <footer className="border-t border-slate-800 bg-[#1B2B4B] text-slate-200">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-10 md:px-6 md:py-12">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="max-w-md">
            <p className="text-lg font-extrabold text-white">გიგორი</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              ქართული ფრილანს და მარკეტპლეისი — იპოვე სერვისები, დაიქირავე პროფესიონალები და მოიძიო სამუშაოები ერთსაიტზე.
            </p>
          </div>
          <nav aria-label="ფუტერის ნავიგაცია">
            <p className="text-xs font-bold uppercase tracking-wider text-[#D4A843]">ბმულები</p>
            <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:flex sm:flex-wrap sm:gap-x-8">
              {footerLinks.map((item) => (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    className="text-sm font-medium text-slate-100 underline-offset-4 transition hover:text-[#D4A843] hover:underline"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t border-slate-700/80 pt-6 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <span>© {year} გიგორი. ყველა უფლება დაცულია.</span>
          <Link to="/register" className="text-slate-300 underline-offset-4 hover:text-[#D4A843] hover:underline">
            რეგისტრაცია
          </Link>
        </div>
      </div>
    </footer>
  )
}
