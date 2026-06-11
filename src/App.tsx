import { Suspense, lazy, useEffect, useState } from "react"
import { Outlet, Route, Routes, useLocation } from "react-router-dom"
import Navbar from "./components/Navbar.tsx"
import PageLoader from "./components/ui/PageLoader.tsx"
import ProtectedRoute from "./components/ProtectedRoute.tsx"
import CookieBanner from "./components/CookieBanner.tsx"
import Footer from "./components/Footer.tsx"
import { buildSiteOrganizationSchema, buildSiteWebSiteSchema, JsonLd } from "./lib/structuredData.tsx"
import { trackPageView } from "./lib/analytics.ts"

const HomePage = lazy(() => import("./pages/Home.tsx"))
const LoginPage = lazy(() => import("./pages/Login.tsx"))
const RegisterPage = lazy(() => import("./pages/Register.tsx"))
const NotFoundPage = lazy(() => import("./pages/NotFound.tsx"))
const DashboardPage = lazy(() => import("./pages/Dashboard.tsx"))
const BrowsePage = lazy(() => import("./pages/Browse.tsx"))
const FreelancerProfilePage = lazy(() => import("./pages/FreelancerProfile.tsx"))
const JobDetailPage = lazy(() => import("./pages/JobDetail.tsx"))
const JobsPage = lazy(() => import("./pages/Jobs.tsx"))
const OnboardingPageStandalone = lazy(() => import("./pages/Onboarding.tsx"))
const PostJobPage = lazy(() => import("./pages/PostJob.tsx"))
const ProfilePage = lazy(() => import("./pages/Profile.tsx"))
const ListingFormPage = lazy(() => import("./pages/ListingForm.tsx"))
const ListingDetailPage = lazy(() => import("./pages/ListingDetail.tsx"))
const CVGeneratorPage = lazy(() => import("./pages/CVGenerator.tsx"))
const PublicCVPage = lazy(() => import("./pages/PublicCV.tsx"))
const ListingsPage = lazy(() => import("./pages/Listings.tsx"))
const HirersPage = lazy(() => import("./pages/Hirers.tsx"))
const HirerPublicPage = lazy(() => import("./pages/HirerPublic.tsx"))
const AboutPage = lazy(() => import("./pages/About.tsx"))
const TermsPage = lazy(() => import("./pages/Terms.tsx"))
const PrivacyPage = lazy(() => import("./pages/Privacy.tsx"))
const CookiesPage = lazy(() => import("./pages/Cookies.tsx"))
const GuidePage = lazy(() => import("./pages/Guide.tsx"))
const FaqPage = lazy(() => import("./pages/Faq.tsx"))
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPassword.tsx"))
const ResetPasswordPage = lazy(() => import("./pages/ResetPassword.tsx"))
const AuthConfirmPage = lazy(() => import("./pages/AuthConfirm.tsx"))
const PayPalCheckoutE2EPage = lazy(() => import("./pages/PayPalCheckoutE2E.tsx"))
const SavedPage = lazy(() => import("./pages/Saved.tsx"))
const MessagesPage = lazy(() => import("./pages/Messages.tsx"))

function MainLayout() {
  const location = useLocation()
  const isMobileChatThread = /^\/messages\/[^/]+$/.test(location.pathname)
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches,
  )

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)")
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [])

  return (
    <>
      {!(isMobileChatThread && isMobile) && <Navbar />}
      <Outlet />
    </>
  )
}

function ScrollToTopOnRouteChange() {
  const location = useLocation()

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" })
  }, [location.pathname, location.search, location.hash])

  return null
}

/** Sends GA4 page_view on each client-side route change (see src/lib/analytics.ts). */
function GoogleAnalyticsPageViews() {
  const location = useLocation()

  useEffect(() => {
    trackPageView(location.pathname + location.search + location.hash)
  }, [location.pathname, location.search, location.hash])

  return null
}

function App() {
  return (
    <>
      <JsonLd data={[buildSiteOrganizationSchema(), buildSiteWebSiteSchema()]} />
      <Suspense fallback={<PageLoader />}>
        <ScrollToTopOnRouteChange />
        <GoogleAnalyticsPageViews />
        <Routes>
          <Route element={<MainLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/browse" element={<BrowsePage />} />
            <Route path="/listings" element={<ListingsPage />} />
            <Route path="/listing/:id" element={<ListingDetailPage />} />
            <Route path="/cv/:slug" element={<PublicCVPage />} />
            <Route path="/hirers" element={<HirersPage />} />
            <Route path="/hirer/:id" element={<HirerPublicPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/cookies" element={<CookiesPage />} />
            <Route path="/guide" element={<GuidePage />} />
            <Route path="/faq" element={<FaqPage />} />
            <Route path="/freelancer/:slug" element={<FreelancerProfilePage />} />
            <Route path="/jobs" element={<JobsPage />} />
            <Route path="/job/:id" element={<JobDetailPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
            <Route path="/auth/confirm" element={<AuthConfirmPage />} />
            <Route path="/register" element={<RegisterPage />} />
            {(import.meta.env.DEV || import.meta.env.VITE_PAYPAL_E2E_DIAG === "1") ? (
              <Route path="/checkout" element={<PayPalCheckoutE2EPage />} />
            ) : null}
            <Route
              path="/saved"
              element={
                <ProtectedRoute>
                  <SavedPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/messages"
              element={
                <ProtectedRoute>
                  <MessagesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/messages/:conversationId"
              element={
                <ProtectedRoute>
                  <MessagesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/onboarding"
              element={
                <ProtectedRoute>
                  <OnboardingPageStandalone />
                </ProtectedRoute>
              }
            />
            <Route
              path="/cv-generator"
              element={
                <ProtectedRoute>
                  <CVGeneratorPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <ProfilePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <ProfilePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/post-job/:jobId"
              element={
                <ProtectedRoute>
                  <PostJobPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/post-job"
              element={
                <ProtectedRoute>
                  <PostJobPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/listing/new"
              element={
                <ProtectedRoute>
                  <ListingFormPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/listing/:id/edit"
              element={
                <ProtectedRoute>
                  <ListingFormPage />
                </ProtectedRoute>
              }
            />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
      <Footer />
      <CookieBanner />
    </>
  )
}

export default App
