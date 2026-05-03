import { Link } from "react-router-dom"
import Navbar from "../components/Navbar.tsx"

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-[#F8F9FC]">
      <Navbar />
      <main className="mx-auto flex min-h-[70vh] w-full max-w-[1200px] flex-col items-center justify-center px-4 text-center md:px-6">
        <p className="text-7xl font-extrabold text-[#1B2B4B]">404</p>
        <p className="mt-3 text-2xl font-bold text-[#1B2B4B]">გვერდი ვერ მოიძებნა</p>
        <Link
          to="/"
          className="mt-6 inline-flex h-11 items-center justify-center rounded-lg bg-[#1B2B4B] px-5 text-sm font-semibold text-white hover:bg-[#D4A843] hover:text-[#1B2B4B]"
        >
          მთავარ გვერდზე
        </Link>
      </main>
    </div>
  )
}
