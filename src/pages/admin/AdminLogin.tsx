import { useState, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { auth } from "../../lib/firebase";
import { signInWithEmailAndPassword } from "firebase/auth";
import { Shield, Lock, Mail, ArrowRight, AlertCircle, Loader2 } from "lucide-react";

export function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  // If user was redirected here from a protected route, send them back after login
  const from = (location.state as any)?.from?.pathname || "/admin";

  // Guard: if already logged in, redirect to admin index
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) navigate(from, { replace: true });
    });
    return () => unsubscribe();
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setErrorMsg("Please enter both email and password.");
      return;
    }

    setIsLoading(true);
    setErrorMsg("");

    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate(from, { replace: true });
    } catch (err: any) {
      console.error("Auth error:", err);
      // Friendly error translation
      if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
        setErrorMsg("Invalid password. Please try again.");
      } else if (err.code === "auth/user-not-found") {
        setErrorMsg("No admin account found with this email.");
      } else if (err.code === "auth/too-many-requests") {
        setErrorMsg("Too many failed attempts. Account temporarily locked.");
      } else {
        setErrorMsg(err.message || "Authentication failed. Please check your credentials.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="h-12 w-12 rounded-xl bg-brand-500 flex items-center justify-center text-white font-black text-xl shadow-md">
            B
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-black text-gray-950 tracking-tight">
          Bitlance CMS
        </h2>
        <p className="mt-2 text-center text-sm text-gray-500 font-semibold">
          Secure Administrator Access Gate
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 border border-gray-200 shadow-xl rounded-3xl sm:px-10">
          {errorMsg && (
            <div className="mb-6 bg-red-50 border border-red-100 text-red-600 text-xs font-semibold p-3.5 rounded-xl flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label className="block text-[10px] font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                Admin Email Address
              </label>
              <div className="relative rounded-xl shadow-2xs">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Mail className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 font-medium text-sm transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                Admin Password
              </label>
              <div className="relative rounded-xl shadow-2xs">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Lock className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 font-medium text-sm transition-all"
                />
              </div>
            </div>

            <div className="flex items-center justify-end pt-1">
              <Link to="/" className="text-xs font-semibold text-gray-500 hover:text-gray-900 transition-colors">
                Back to main site
              </Link>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-brand-500 hover:bg-brand-600 disabled:bg-brand-400 text-white font-bold py-3.5 px-6 rounded-xl transition-all shadow-md text-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Verifying Admin...
                </>
              ) : (
                <>
                  Authenticate Access
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 border-t border-gray-150 pt-5 text-center">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center justify-center gap-1.5">
              {/* <Shield className="w-3.5 h-3.5 text-brand-500" /> Powered by Firebase Security */}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
