import { useEffect, useState, useRef } from "react";
import { Trash2, UserPlus, AlertTriangle, X, Shield, Eye, EyeOff, Upload, User } from "lucide-react";
import {
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
} from "firebase/firestore";
import { app, db } from "../../lib/firebase";

const auth = getAuth(app);

export function AdminUsers() {
  const [users, setUsers] = useState<any[]>([]);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string>("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Shared map ref so both collections update independently without overwriting each other
  const usersMapRef = useRef<Map<string, any>>(new Map());

  const syncToState = () => {
    const merged = Array.from(usersMapRef.current.values());
    merged.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    setUsers(merged);
  };

  useEffect(() => {
    const unsubAuthors = onSnapshot(
      collection(db, "authors"),
      (snap) => {
        snap.docs.forEach((d) =>
          usersMapRef.current.set(d.id, { ...d.data(), id: d.id })
        );
        snap.docChanges().forEach((change) => {
          if (change.type === "removed") usersMapRef.current.delete(change.doc.id);
        });
        syncToState();
      },
      (err) => console.error("Error listening to authors:", err)
    );

    const unsubUsers = onSnapshot(
      collection(db, "users"),
      (snap) => {
        snap.docs.forEach((d) =>
          usersMapRef.current.set(d.id, { ...d.data(), id: d.id })
        );
        snap.docChanges().forEach((change) => {
          if (change.type === "removed") usersMapRef.current.delete(change.doc.id);
        });
        syncToState();
      },
      (err) => console.error("Error listening to users:", err)
    );

    return () => {
      unsubAuthors();
      unsubUsers();
    };
  }, []);

  // Convert File to base64 string
  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const uploadAvatarToCloudinary = async (file: File): Promise<string> => {
    const base64 = await fileToBase64(file);
    const res = await fetch("/api/media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file: base64,
        originalName: file.name,
        title: newName.trim() || file.name,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to upload profile picture.");
    }
    const data = await res.json();
    return data.url as string;
  };

  const resetForm = () => {
    setNewName("");
    setNewEmail("");
    setNewPassword("");
    setShowPassword(false);
    setAvatarFile(null);
    setAvatarPreview("");
    setError("");
    setIsAddingUser(false);
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newEmail.trim() || !newPassword.trim()) return;
    setIsSaving(true);
    setError("");

    const currentUser = auth.currentUser;
    const currentEmail = currentUser?.email || "";

    try {
      // 1. Upload avatar to Cloudinary first (if provided)
      let avatarUrl = "";
      if (avatarFile) {
        avatarUrl = await uploadAvatarToCloudinary(avatarFile);
      }

      // 2. Create Firebase Auth account
      const credential = await createUserWithEmailAndPassword(
        auth,
        newEmail.trim(),
        newPassword.trim()
      );
      const uid = credential.user.uid;

      // 3. Save profile to Firestore
      await setDoc(doc(db, "authors", uid), {
        id: uid,
        name: newName.trim(),
        email: newEmail.trim(),
        ...(avatarUrl ? { avatar: avatarUrl } : {}),
        created_at: new Date().toISOString(),
      });

      // 4. Restore original admin session
      if (currentEmail && import.meta.env.VITE_ADMIN_PASSWORD) {
        await signInWithEmailAndPassword(
          auth,
          currentEmail,
          import.meta.env.VITE_ADMIN_PASSWORD
        ).catch(() => signOut(auth));
      }

      resetForm();
    } catch (err: any) {
      setError(err.message || "Failed to create user.");
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, "authors", deleteId));
      await deleteDoc(doc(db, "users", deleteId));
      setDeleteId(null);
    } catch (err) {
      console.error("Error removing user:", err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight heading-display">Users</h1>
          <p className="text-gray-500 mt-1 font-medium">Manage team members and platform publishers.</p>
        </div>
        {!isAddingUser && (
          <button
            onClick={() => { setIsAddingUser(true); setError(""); }}
            className="flex items-center justify-center gap-2 bg-brand-500 text-white px-5 py-3 sm:py-2.5 rounded-full font-bold hover:bg-brand-600 transition-colors shadow-sm w-full sm:w-auto text-sm min-h-[44px]"
          >
            <UserPlus className="h-4 w-4" />
            Add User
          </button>
        )}
      </div>

      {isAddingUser && (
        <form onSubmit={handleAddUser} className="mb-8 p-6 bg-white border border-gray-200 rounded-2xl shadow-sm animate-fade-in">
          <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-100">
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Shield className="w-5 h-5 text-brand-500" /> Add Team Member
            </h3>
            <button
              type="button"
              onClick={resetForm}
              className="text-gray-400 hover:text-gray-600 p-2 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {error && (
            <div className="mb-4 px-4 py-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600 font-medium">
              {error}
            </div>
          )}

          {/* Profile Picture Upload */}
          <div className="flex flex-col items-center mb-6">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="relative w-24 h-24 rounded-full border-2 border-dashed border-gray-300 hover:border-brand-400 bg-gray-50 hover:bg-brand-50/30 flex items-center justify-center cursor-pointer transition-all overflow-hidden group"
            >
              {avatarPreview ? (
                <>
                  <img
                    src={avatarPreview}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Upload className="w-5 h-5 text-white" />
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center gap-1 text-gray-400 group-hover:text-brand-500 transition-colors">
                  <User className="w-8 h-8" />
                  <Upload className="w-4 h-4" />
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
            <p className="text-xs text-gray-400 font-medium mt-2">
              {avatarFile ? avatarFile.name : "Click to upload profile picture"}
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            {/* Name */}
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Full Name</label>
              <input
                type="text"
                required
                className="w-full border border-gray-200 rounded-xl p-3 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 font-medium text-sm transition-all min-h-[44px]"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Alice Satoshi"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Email</label>
              <input
                type="email"
                required
                className="w-full border border-gray-200 rounded-xl p-3 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 font-medium text-sm transition-all min-h-[44px]"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="alice@bitlance.work"
              />
            </div>

            {/* Password */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={6}
                  className="w-full border border-gray-200 rounded-xl p-3 pr-11 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 font-medium text-sm transition-all min-h-[44px]"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min. 6 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-4 border-t border-gray-50 w-full">
            <button
              type="button"
              onClick={resetForm}
              disabled={isSaving}
              className="px-4 py-3 sm:py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors disabled:opacity-50 w-full sm:w-auto text-center min-h-[44px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-3 sm:py-2.5 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-50 shadow-sm w-full sm:w-auto text-center min-h-[44px]"
            >
              {isSaving ? "Creating..." : "Create User"}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
        {/* Mobile View */}
        <div className="block md:hidden divide-y divide-gray-100">
          {users.map((user) => (
            <div key={user.id} className="p-4 space-y-3">
              <div className="flex items-center gap-3">
                {user.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.name}
                    className="w-12 h-12 rounded-full bg-gray-100 border border-gray-150 shrink-0 object-cover"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gray-100 border border-gray-150 shrink-0 flex items-center justify-center text-gray-400">
                    <User className="w-6 h-6" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-gray-950 truncate">{user.name}</div>
                  <div className="text-xs text-gray-400 font-mono mt-0.5 truncate">{user.email || user.id}</div>
                </div>
              </div>
              <div className="pt-2 mt-3 border-t border-gray-50 flex">
                <button
                  onClick={() => setDeleteId(user.id)}
                  className="w-full flex justify-center items-center gap-2 p-2.5 bg-red-50 text-red-600 rounded-xl font-bold text-sm transition-colors hover:bg-red-100"
                >
                  <Trash2 className="h-4 w-4" /> Remove User
                </button>
              </div>
            </div>
          ))}
          {users.length === 0 && (
            <div className="p-8 text-center text-gray-400 font-medium">No users found.</div>
          )}
        </div>

        {/* Desktop View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left min-w-[500px]">
            <thead className="bg-gray-50 border-b border-gray-150">
              <tr>
                <th className="py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">User</th>
                <th className="py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Email</th>
                <th className="py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50/40 transition-colors">
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-3">
                      {user.avatar ? (
                        <img
                          src={user.avatar}
                          alt={user.name}
                          className="w-10 h-10 rounded-full bg-gray-100 border border-gray-150 shrink-0 object-cover"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gray-100 border border-gray-150 shrink-0 flex items-center justify-center text-gray-400">
                          <User className="w-5 h-5" />
                        </div>
                      )}
                      <div className="font-bold text-gray-950">{user.name}</div>
                    </div>
                  </td>
                  <td className="py-4 px-6 text-sm text-gray-500 font-mono">
                    {user.email || "—"}
                  </td>
                  <td className="py-4 px-6">
                    <div className="flex items-center justify-end">
                      <button
                        onClick={() => setDeleteId(user.id)}
                        className="p-2 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100"
                        title="Remove user"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-16 text-center text-gray-400 font-medium">
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-gray-950/40 backdrop-blur-xs transition-opacity" onClick={() => setDeleteId(null)} />
          <div className="relative bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 transform transition-all animate-scale-up">
            <div className="absolute top-4 right-4">
              <button
                onClick={() => setDeleteId(null)}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex gap-4 items-start mb-6">
              <div className="w-10 h-10 rounded-full bg-red-50 border border-red-100 flex items-center justify-center text-red-600 shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-950 mb-1">Remove Team Member</h3>
                <p className="text-sm text-gray-500 leading-relaxed font-medium">
                  This removes the user's profile from Firestore. To fully revoke login access, also delete them from the Firebase Auth console.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteId(null)}
                disabled={isDeleting}
                className="px-4 py-2 text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 text-sm font-bold text-white bg-red-500 border border-transparent rounded-xl hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
              >
                {isDeleting ? "Removing..." : "Remove Member"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
