import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MediaLibraryModal } from "../../components/MediaLibraryModal";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import CharacterCount from "@tiptap/extension-character-count";
import Youtube from "@tiptap/extension-youtube";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import { FontFamily } from "@tiptap/extension-font-family";
import { Color } from "@tiptap/extension-color";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { apiFetch } from "../../lib/api";
import { collection, doc, getDoc, getDocs, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";

import {
  Save,
  ArrowLeft,
  Image as ImageIcon,
  Link as LinkIcon,
  List,
  Heading2,
  Bold,
  Italic,
  Folder,
  Youtube as YoutubeIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Table as TableIcon,
  Sparkles,
  Search,
  CheckCircle,
  AlertTriangle,
  HelpCircle,
  Link2,
  BookOpen,
  Info,
  ChevronRight,
  Settings,
  Shield,
  Layout,
  FileCode,
  Cpu,
  ClipboardList
} from "lucide-react";

type ActiveTab = "seo" | "ai" | "blocks";

export function EditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  // General States
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [categories, setCategories] = useState<any[]>([
    { id: "c3", name: "Getting Started", slug: "getting-started" },
    { id: "c4", name: "Tutorials", slug: "tutorials" },
    { id: "c2", name: "Success Stories", slug: "success-stories" },
    { id: "c1", name: "Product Updates", slug: "product-updates" },
    { id: "c5", name: "Bitcoin & Lightning", slug: "bitcoin-lightning" },
    { id: "c6", name: "Insights", slug: "insights" },
  ]);
  const [featuredImage, setFeaturedImage] = useState("");
  const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);
  const [mediaTarget, setMediaTarget] = useState<"cover" | "inline">("cover");
  const [saving, setSaving] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setShowToast(true);
    setTimeout(() => {
      setShowToast(false);
    }, 3000);
  };

  // Advanced SEO States
  const [seoTitle, setSeoTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [slug, setSlug] = useState("");
  const [canonicalUrl, setCanonicalUrl] = useState("");
  const [robotsMeta, setRobotsMeta] = useState("index, follow");
  const [ogTitle, setOgTitle] = useState("");
  const [ogDescription, setOgDescription] = useState("");
  const [ogImage, setOgImage] = useState("");
  const [twitterCard, setTwitterCard] = useState("summary_large_image");
  const [schemaData, setSchemaData] = useState("");
  const [featuredImageAlt, setFeaturedImageAlt] = useState("");

  // Blocks States
  const [faqs, setFaqs] = useState<{ question: string; answer: string }[]>([]);
  const [relatedArticleIds, setRelatedArticleIds] = useState<string[]>([]);
  const [allArticles, setAllArticles] = useState<any[]>([]);

  // Sidebar controls
  const [activeTab, setActiveTab] = useState<ActiveTab>("seo");

  // Load Categories
  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setCategories(data);
        }
      })
      .catch(console.error);
  }, []);

  // Initialize Rich Text Editor
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: "Write your high-quality, semantic article here...",
      }),
      Image,
      Link,
      CharacterCount,
      Youtube.configure({
        inline: false,
      }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      TextStyle,
      Color,
      FontFamily,
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: "",
    editorProps: {
      attributes: {
        class: "prose prose-lg prose-brand max-w-none focus:outline-none min-h-[500px] text-gray-800",
      },
    },
  });

  // Fetch Existing Article
  useEffect(() => {
    if (id && id !== "new") {
      const loadArticle = async () => {
        try {
          // Try articles first
          let docSnap = await getDoc(doc(db, "articles", id));
          if (!docSnap.exists()) {
            // Try drafts next
            docSnap = await getDoc(doc(db, "drafts", id));
          }

          if (docSnap.exists()) {
            const data = docSnap.data();
            setTitle(data.title || "");
            setSubtitle(data.subtitle || "");
            setFeaturedImage(data.featured_image || "");
            setCategoryId(data.category_id || "");
            editor?.commands.setContent(data.content || "");

            // Advanced SEO
            setSeoTitle(data.seo_title || "");
            setMetaDescription(data.meta_description || "");
            setSlug(data.slug || "");
            setCanonicalUrl(data.canonical_url || "");
            setRobotsMeta(data.robots_meta || "index, follow");
            setOgTitle(data.og_title || "");
            setOgDescription(data.og_description || "");
            setOgImage(data.og_image || "");
            setTwitterCard(data.twitter_card || "summary_large_image");
            setSchemaData(data.schema_data || "");
            setFeaturedImageAlt(data.featured_image_alt || "");

            // FAQs and Related
            setFaqs(data.faqs || []);
            setRelatedArticleIds(data.related_article_ids || []);
          }
        } catch (err) {
          console.error("Error loading article from Firestore:", err);
        }
      };
      loadArticle();
    }
  }, [id, editor]);

  // Fetch all articles for suggestions
  useEffect(() => {
    const loadSuggestions = async () => {
      try {
        const articlesList: any[] = [];
        const snapPub = await getDocs(collection(db, "articles"));
        snapPub.forEach(d => {
          articlesList.push({ id: d.id, ...d.data() });
        });

        const snapDraft = await getDocs(collection(db, "drafts"));
        snapDraft.forEach(d => {
          articlesList.push({ id: d.id, ...d.data() });
        });

        setAllArticles(articlesList.filter((a: any) => a.id !== id));
      } catch (err) {
        console.error("Error loading suggestions from Firestore:", err);
      }
    };
    loadSuggestions();
  }, [id]);

  // Auto-generate Slug & SEO Fields on Title Change
  useEffect(() => {
    if (!id || id === "new") {
      const generatedSlug = title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .trim();
      setSlug(generatedSlug);
      
      if (!seoTitle) {
        setSeoTitle(title);
      }
    }
  }, [title]);

  // Handle Save / Publish API
  const handleSave = async (status: "draft" | "published") => {
    if (!editor) return;
    setSaving(true);
    const content = editor.getHTML();

    const docId = id && id !== "new" ? id : "a_" + Date.now();
    const isPublished = status === "published";
    const resolvedSlug = slug || title.toLowerCase().replace(/[^a-z0-9]+/g, "-");

    const payload: any = {
      id: docId,
      title,
      subtitle,
      category_id: categoryId,
      featured_image: featuredImage,
      content,
      status,
      reading_time:
        Math.ceil((editor.storage.characterCount.words() || 0) / 200) + " min read",

      // Advanced SEO settings
      seo_title: seoTitle || title,
      meta_description: metaDescription || subtitle,
      slug: resolvedSlug,
      canonical_url: canonicalUrl,
      robots_meta: robotsMeta,
      og_title: ogTitle || seoTitle || title,
      og_description: ogDescription || metaDescription || subtitle,
      og_image: ogImage || featuredImage,
      twitter_card: twitterCard,
      schema_data: schemaData,
      featured_image_alt: featuredImageAlt,

      // Blocks settings
      faqs,
      related_article_ids: relatedArticleIds,
      updated_at: new Date().toISOString(),
    };

    try {
      if (id === "new") {
        payload.created_at = new Date().toISOString();
        payload.published_at = isPublished ? new Date().toISOString() : null;
        payload.view_count = 0;
      } else {
        // Fetch original to preserve created_at / view_count
        let originalDoc = await getDoc(doc(db, "articles", id));
        if (!originalDoc.exists()) {
          originalDoc = await getDoc(doc(db, "drafts", id));
        }
        if (originalDoc.exists()) {
          const originalData = originalDoc.data();
          payload.created_at = originalData.created_at || new Date().toISOString();
          payload.view_count = originalData.view_count || 0;
          payload.published_at = originalData.published_at;
          
          if (isPublished && !payload.published_at) {
            payload.published_at = new Date().toISOString();
          }
        }
      }

      // If we are updating an existing article, delete from the opposite collection in case the status changed
      if (id && id !== "new") {
        const oppositeCol = isPublished ? "drafts" : "articles";
        await deleteDoc(doc(db, oppositeCol, docId));
      }

      // Save to correct collection
      const targetCol = isPublished ? "articles" : "drafts";
      await setDoc(doc(db, targetCol, docId), payload);

      setSaving(false);
      navigate("/admin/articles");
    } catch (e: any) {
      console.error(e);
      alert(e.message);
      setSaving(false);
    }
  };

  // FAQ builders
  const addFaq = () => {
    setFaqs([...faqs, { question: "", answer: "" }]);
  };

  const updateFaq = (index: number, field: "question" | "answer", val: string) => {
    const updated = [...faqs];
    updated[index][field] = val;
    setFaqs(updated);
  };

  const removeFaq = (index: number) => {
    setFaqs(faqs.filter((_, i) => i !== index));
  };

  // AI Semantic Audits
  const analyzeHeadings = () => {
    if (!editor) return { valid: true, issues: [] as string[], count: 0 };
    const html = editor.getHTML();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const headings = Array.from(doc.querySelectorAll("h1, h2, h3, h4, h5, h6"));

    const issues: string[] = [];
    let prevLevel = 1;
    let doubleH1 = false;

    headings.forEach((h, idx) => {
      const level = parseInt(h.tagName.substring(1), 10);
      if (level === 1) {
        doubleH1 = true;
      }
      if (level > prevLevel + 1) {
        issues.push(
          `Hierarchy skip: H${prevLevel} to H${level} ("${h.textContent?.substring(0, 20)}...")`
        );
      }
      prevLevel = level;
    });

    if (doubleH1) {
      issues.push(
        "Multiple H1 tags detected. Prefer using a single main title (H1) and H2/H3 within body content."
      );
    }

    return {
      valid: issues.length === 0,
      issues,
      count: headings.length,
    };
  };

  const analyzeReadability = () => {
    if (!editor) return { score: 100, status: "Good", paragraphs: 0, avgSentLength: 0 };
    const text = editor.getText();
    const wordsCount = editor.storage.characterCount.words() || 0;
    const paragraphs = text.split("\n").filter((p) => p.trim().length > 0).length;
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0).length;

    const avgSentLength = sentences > 0 ? Math.round(wordsCount / sentences) : 0;

    let score = 100;
    let status = "Highly Readable";

    if (avgSentLength > 20) {
      score -= 25;
      status = "Moderate (Long sentences)";
    }
    if (paragraphs > 0 && wordsCount / paragraphs > 120) {
      score -= 15;
      status = "Densely Packed Paragraphs";
    }

    return {
      score: Math.max(0, score),
      status,
      paragraphs,
      avgSentLength,
    };
  };

  // Entity Target density scan for AI Search Engine optimization
  const entityEntities = [
    { name: "Bitcoin", keywords: ["bitcoin", "btc"], required: true, found: false },
    { name: "Lightning Network", keywords: ["lightning", "lnd", "lightning network"], required: true, found: false },
    { name: "Satoshis", keywords: ["sats", "satoshi", "satoshis"], required: false, found: false },
    { name: "Freelancing", keywords: ["freelance", "freelancer", "freelancing", "gigs"], required: true, found: false },
    { name: "Escrow / Multi-sig", keywords: ["escrow", "multi-sig", "multisig", "contract"], required: false, found: false },
  ];

  const getEntitiesScan = () => {
    if (!editor) return entityEntities;
    const txt = editor.getText().toLowerCase();
    return entityEntities.map((ent) => {
      const found = ent.keywords.some((kw) => txt.includes(kw));
      return { ...ent, found };
    });
  };

  const entityScanResult = getEntitiesScan();
  const headingAnalysis = analyzeHeadings();
  const readabilityAnalysis = analyzeReadability();

  // Internal link suggestions based on current category
  const internalLinkingSuggestions = categoryId
    ? allArticles.filter((a: any) => a.category_id === categoryId).slice(0, 3)
    : [];

  // Calculate dynamic SEO/AI health score
  const getOverallHealthScore = () => {
    let score = 50;
    if (title.length > 10) score += 10;
    if (subtitle.length > 20) score += 10;
    if (featuredImage) score += 10;
    if (metaDescription.length > 50) score += 10;
    if (headingAnalysis.valid && headingAnalysis.count > 0) score += 10;
    return Math.min(100, score);
  };

  const overallHealth = getOverallHealthScore();

  const handleMediaSelect = (media: any) => {
    if (mediaTarget === "cover") {
      setFeaturedImage(media.url);
      setFeaturedImageAlt(media.altText || media.title || "");
    } else if (mediaTarget === "inline" && editor) {
      editor.chain().focus().setImage({ 
        src: media.url, 
        alt: media.altText || media.title || "", 
        title: media.title || "" 
      }).run();
    }
    setIsMediaModalOpen(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* CMS Header Banner */}
      <header className="sticky top-0 z-20 bg-white border-b border-gray-200 px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between shadow-sm gap-4">
        <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-start">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/admin/articles")}
              className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center sm:min-h-0 sm:min-w-0"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-gray-900 tracking-tight flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-brand-500" />
                <span className="hidden sm:inline">{id && id !== "new" ? "Edit Article Studio" : "Create Semantic Content"}</span>
                <span className="sm:hidden">{id && id !== "new" ? "Edit Article" : "Create Content"}</span>
              </h1>
              <p className="text-[10px] sm:text-xs text-gray-500 font-medium">
                SEO and AI engine active
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-row items-center gap-3 w-full sm:w-auto">
          <button
            onClick={() => handleSave("draft")}
            className="flex-1 sm:flex-none text-center justify-center text-gray-600 border border-gray-200 hover:bg-gray-50 px-4 sm:px-5 py-3 sm:py-2 rounded-full font-bold text-sm transition-colors min-h-[44px]"
          >
            Save Draft
          </button>
          <button
            onClick={() => handleSave("published")}
            className="flex-1 sm:flex-none justify-center bg-brand-500 text-white px-4 sm:px-6 py-3 sm:py-2 rounded-full font-bold text-sm hover:bg-brand-600 transition-colors shadow-sm flex items-center gap-2 min-h-[44px]"
          >
            <CheckCircle className="h-4 w-4 shrink-0" />
            <span className="whitespace-nowrap">Publish</span>
          </button>
        </div>
      </header>

      {/* Main CMS Workspace Grid */}
      <div className="flex-1 flex flex-col lg:flex-row lg:h-[calc(100vh-73px)] overflow-hidden">
        {/* Left Side: Traditional Content Drafting Workspace */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 sm:py-10 bg-white border-b lg:border-b-0 lg:border-r border-gray-100">
          <div className="max-w-3xl mx-auto space-y-6 sm:space-y-8">
            {/* Category & Cover Row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 border-b border-gray-100 pb-4 sm:pb-6">
              <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-4 py-3 sm:py-2.5 bg-gray-50 flex-1 sm:flex-none">
                <Folder className="h-4 w-4 text-brand-500 shrink-0" />
                <select
                  className="bg-transparent border-none text-sm font-semibold text-gray-700 outline-none w-full sm:w-44 cursor-pointer"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                >
                  <option value="">Choose Category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Cover Image Control */}
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => {
                    setMediaTarget("cover");
                    setIsMediaModalOpen(true);
                  }}
                  className="w-full sm:w-auto justify-center text-sm sm:text-xs font-bold text-white bg-brand-500 hover:bg-brand-600 px-4 py-3 sm:py-2.5 rounded-xl transition-all shadow-sm cursor-pointer flex items-center gap-1.5 min-h-[44px]"
                >
                  <ImageIcon className="h-4 w-4 shrink-0" />
                  <span>{featuredImage ? "Replace Cover Image" : "Select Cover Image"}</span>
                </button>
              </div>
            </div>

            {/* Title & Subtitle Inputs */}
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Unleash an Article Title..."
                className="w-full text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-950 border-none outline-none bg-transparent placeholder:text-gray-200 font-sans tracking-tight focus:ring-0 leading-tight"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <textarea
                placeholder="Write a highly informative subtitle / short introductory excerpt to hook search query agents..."
                rows={2}
                className="w-full text-base sm:text-lg text-gray-500 border-none outline-none bg-transparent placeholder:text-gray-300 resize-none focus:ring-0 leading-relaxed"
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
              />
            </div>

            {/* Featured Image Canvas Preview */}
            {featuredImage && (
              <div className="rounded-3xl overflow-hidden border border-gray-100 shadow-sm relative group aspect-[21/9]">
                <img
                  src={featuredImage}
                  alt="Feature Preview"
                  className="w-full h-full object-cover"
                />
                <button
                  onClick={() => setFeaturedImage("")}
                  className="absolute top-4 right-4 bg-red-500 text-white px-3 py-1.5 rounded-xl text-xs font-bold shadow-md hover:bg-red-600 transition-colors"
                >
                  Remove Cover
                </button>

                {/* Featured image ALT TEXT */}
                <div className="absolute bottom-0 left-0 right-0 bg-black/70 backdrop-blur-sm p-3 flex items-center gap-2">
                  <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wider shrink-0">
                    Alt Text:
                  </span>
                  <input
                    type="text"
                    placeholder="Describe this image for blind users and Google Bot image indexers..."
                    className="flex-1 bg-transparent border-none text-xs text-white outline-none placeholder:text-gray-400 p-0 focus:ring-0"
                    value={featuredImageAlt}
                    onChange={(e) => setFeaturedImageAlt(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Tiptap Rich-Text Action Bar */}
            {editor && (
              <div className="sticky top-0 z-10 w-full mb-4 flex flex-wrap items-center gap-1.5 bg-white border border-gray-200 rounded-2xl p-2 shadow-sm justify-start">
                {/* Formatting Tools */}
                <button
                  type="button"
                  onClick={() => editor.chain().focus().toggleBold().run()}
                  className={`p-2 rounded-xl transition-colors hover:bg-gray-50 ${editor.isActive("bold") ? "bg-brand-50 text-brand-600 font-bold" : "text-gray-600"}`}
                  title="Bold Text"
                >
                  <Bold className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => editor.chain().focus().toggleItalic().run()}
                  className={`p-2 rounded-xl transition-colors hover:bg-gray-50 ${editor.isActive("italic") ? "bg-brand-50 text-brand-600" : "text-gray-600"}`}
                  title="Italic Text"
                >
                  <Italic className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                  className={`p-2 rounded-xl transition-colors hover:bg-gray-50 ${editor.isActive("heading", { level: 2 }) ? "bg-brand-50 text-brand-600" : "text-gray-600"}`}
                  title="Sub-heading H2"
                >
                  <Heading2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => editor.chain().focus().toggleBulletList().run()}
                  className={`p-2 rounded-xl transition-colors hover:bg-gray-50 ${editor.isActive("bulletList") ? "bg-brand-50 text-brand-600" : "text-gray-600"}`}
                  title="Bullet List"
                >
                  <List className="h-4 w-4" />
                </button>

                <div className="w-px h-6 bg-gray-200 mx-1" />

                <button
                  type="button"
                  onClick={() => {
                    const url = window.prompt("Enter hyper-link URL:");
                    if (url) editor.chain().focus().setLink({ href: url }).run();
                  }}
                  className="p-2 rounded-xl transition-colors hover:bg-gray-50 text-gray-600"
                  title="Hyperlink Block"
                >
                  <LinkIcon className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMediaTarget("inline");
                    setIsMediaModalOpen(true);
                  }}
                  className="p-2 rounded-xl transition-colors hover:bg-gray-50 text-gray-600 cursor-pointer"
                  title="Embed Image from Media Library"
                >
                  <ImageIcon className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const url = window.prompt("Enter YouTube Embed Link:");
                    if (url) editor.chain().focus().setYoutubeVideo({ src: url }).run();
                  }}
                  className="p-2 rounded-xl transition-colors hover:bg-gray-50 text-gray-600"
                  title="Embed YouTube Video"
                >
                  <YoutubeIcon className="h-4 w-4" />
                </button>

                <div className="w-px h-6 bg-gray-200 mx-1" />

                {/* Table insertion */}
                <button
                  type="button"
                  onClick={() =>
                    editor
                      .chain()
                      .focus()
                      .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                      .run()
                  }
                  className="p-2 rounded-xl transition-colors hover:bg-gray-50 text-gray-600"
                  title="Insert Comparison Table"
                >
                  <TableIcon className="h-4 w-4" />
                </button>

                {/* Advanced alignment */}
                <button
                  type="button"
                  onClick={() => editor.chain().focus().setTextAlign("left").run()}
                  className="p-2 rounded-xl transition-colors hover:bg-gray-50 text-gray-600"
                  title="Align Left"
                >
                  <AlignLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => editor.chain().focus().setTextAlign("center").run()}
                  className="p-2 rounded-xl transition-colors hover:bg-gray-50 text-gray-600"
                  title="Align Center"
                >
                  <AlignCenter className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Rich Editor Canvas container */}
            <div className="border border-gray-100 rounded-3xl p-6 min-h-[500px] hover:border-gray-200/80 focus-within:border-brand-300 transition-all shadow-inner">
              <EditorContent editor={editor} />
            </div>
          </div>
        </div>

        {/* Right Side: Smart Meta SEO & AI Search Optimizer Panel */}
        <aside className="w-full lg:w-[420px] bg-gray-50 border-l border-gray-200 flex flex-col overflow-hidden h-full">
          {/* Header Health Meter */}
          <div className="p-6 bg-white border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-500 fill-amber-500 animate-pulse" />
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
                  Semantic Score
                </span>
                <h3 className="text-lg font-extrabold text-gray-950">{overallHealth}% Optimized</h3>
              </div>
            </div>

            {/* Progress Circular visual */}
            <div className="relative h-12 w-12 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="24"
                  cy="24"
                  r="20"
                  className="stroke-gray-100 fill-transparent"
                  strokeWidth="4"
                />
                <circle
                  cx="24"
                  cy="24"
                  r="20"
                  className={`fill-transparent transition-all duration-500 ${overallHealth > 80 ? "stroke-emerald-500" : "stroke-amber-500"}`}
                  strokeWidth="4"
                  strokeDasharray={`${2 * Math.PI * 20}`}
                  strokeDashoffset={`${2 * Math.PI * 20 * (1 - overallHealth / 100)}`}
                />
              </svg>
              <span className="absolute text-xs font-black text-gray-800">{overallHealth}%</span>
            </div>
          </div>

          {/* Tab Navigation buttons */}
          <div className="flex bg-white border-b border-gray-100 text-xs font-bold p-1 gap-1">
            <button
              onClick={() => setActiveTab("seo")}
              className={`flex-1 py-3 flex items-center justify-center gap-1.5 rounded-xl transition-all ${activeTab === "seo" ? "bg-brand-500 text-white shadow-sm" : "text-gray-500 hover:bg-gray-50"}`}
            >
              <Search className="w-4 h-4 shrink-0" /> SEO Settings
            </button>
            <button
              onClick={() => setActiveTab("ai")}
              className={`flex-1 py-3 flex items-center justify-center gap-1.5 rounded-xl transition-all ${activeTab === "ai" ? "bg-brand-500 text-white shadow-sm" : "text-gray-500 hover:bg-gray-50"}`}
            >
              <Cpu className="w-4 h-4 shrink-0" /> AI Search Audit
            </button>
            <button
              onClick={() => setActiveTab("blocks")}
              className={`flex-1 py-3 flex items-center justify-center gap-1.5 rounded-xl transition-all ${activeTab === "blocks" ? "bg-brand-500 text-white shadow-sm" : "text-gray-500 hover:bg-gray-50"}`}
            >
              <ClipboardList className="w-4 h-4 shrink-0" /> Blocks & Related
            </button>
          </div>

          {/* Scrollable Panel Container */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* TAB 1: SEO SETTINGS */}
            {activeTab === "seo" && (
              <div className="space-y-5 animate-fade-in">
                <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 text-xs text-emerald-800 flex items-start gap-2.5">
                  <Info className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
                  <p className="font-medium leading-relaxed">
                    Search crawlers prioritize customized metadata. Enter targeted keywords matching actual user search intent.
                  </p>
                </div>

                {/* Slug Auto Gen */}
                <div className="space-y-2">
                  <label className="text-xs font-extrabold text-gray-700 uppercase tracking-wider flex items-center justify-between">
                    <span>URL Slug Path</span>
                    <span className="text-[10px] text-gray-400 font-semibold lowercase">
                      /article/{slug || "auto"}
                    </span>
                  </label>
                  <input
                    type="text"
                    placeholder="URL slug path..."
                    className="w-full text-sm border border-gray-200 rounded-xl px-4 py-3 bg-white outline-none focus:border-brand-500"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                  />
                </div>

                {/* Custom SEO Title */}
                <div className="space-y-2">
                  <label className="text-xs font-extrabold text-gray-700 uppercase tracking-wider flex items-center justify-between">
                    <span>SEO Meta Title</span>
                    <span className={`text-[10px] font-bold ${(seoTitle || title).length > 60 ? "text-red-500" : "text-emerald-500"}`}>
                      {(seoTitle || title).length} / 60 chars
                    </span>
                  </label>
                  <input
                    type="text"
                    placeholder={title || "Title tag..."}
                    className="w-full text-sm border border-gray-200 rounded-xl px-4 py-3 bg-white outline-none focus:border-brand-500"
                    value={seoTitle}
                    onChange={(e) => setSeoTitle(e.target.value)}
                  />
                </div>

                {/* Custom Meta Description */}
                <div className="space-y-2">
                  <label className="text-xs font-extrabold text-gray-700 uppercase tracking-wider flex items-center justify-between">
                    <span>Meta Description</span>
                    <span className={`text-[10px] font-bold ${(metaDescription || subtitle).length > 160 ? "text-red-500" : "text-emerald-500"}`}>
                      {(metaDescription || subtitle).length} / 160 chars
                    </span>
                  </label>
                  <textarea
                    placeholder={subtitle || "Describe content briefly to display in SERP..."}
                    rows={3}
                    className="w-full text-sm border border-gray-200 rounded-xl px-4 py-3 bg-white outline-none focus:border-brand-500 resize-none"
                    value={metaDescription}
                    onChange={(e) => setMetaDescription(e.target.value)}
                  />
                </div>

                {/* Canonical URL override */}
                <div className="space-y-2">
                  <label className="text-xs font-extrabold text-gray-700 uppercase tracking-wider flex items-center justify-between">
                    <span>Canonical URL Override</span>
                    <span className="text-[10px] text-gray-400 font-medium">Prevents duplicate content issues</span>
                  </label>
                  <input
                    type="text"
                    placeholder="https://originalsource.com/..."
                    className="w-full text-sm border border-gray-200 rounded-xl px-4 py-3 bg-white outline-none focus:border-brand-500"
                    value={canonicalUrl}
                    onChange={(e) => setCanonicalUrl(e.target.value)}
                  />
                </div>

                {/* Crawling robots */}
                <div className="space-y-2">
                  <label className="text-xs font-extrabold text-gray-700 uppercase tracking-wider">
                    Robots Indexing Directive
                  </label>
                  <select
                    className="w-full text-sm border border-gray-200 rounded-xl px-4 py-3 bg-white outline-none focus:border-brand-500"
                    value={robotsMeta}
                    onChange={(e) => setRobotsMeta(e.target.value)}
                  >
                    <option value="index, follow">Index, Follow (Google Standard)</option>
                    <option value="noindex, follow">Noindex, Follow (Internal Pages)</option>
                    <option value="index, nofollow">Index, Nofollow (Review/PR Pages)</option>
                    <option value="noindex, nofollow">Noindex, Nofollow (Draft / Secrets)</option>
                  </select>
                </div>

                {/* Open Graph Overrides */}
                <div className="border border-gray-200 rounded-2xl bg-white p-4 space-y-4">
                  <span className="text-xs font-bold text-gray-800 flex items-center gap-2">
                    <Shield className="h-4 w-4 text-brand-500" /> Open Graph Social Override
                  </span>

                  <div className="space-y-3 text-xs">
                    <div>
                      <span className="text-gray-400 block mb-1">OG Title Override</span>
                      <input
                        type="text"
                        placeholder={seoTitle || title || "Default is SEO Title"}
                        className="w-full border border-gray-100 rounded-lg p-2.5 outline-none text-sm"
                        value={ogTitle}
                        onChange={(e) => setOgTitle(e.target.value)}
                      />
                    </div>
                    <div>
                      <span className="text-gray-400 block mb-1">OG Description</span>
                      <textarea
                        placeholder={metaDescription || subtitle || "Default is Meta Description"}
                        rows={2}
                        className="w-full border border-gray-100 rounded-lg p-2.5 outline-none text-sm resize-none"
                        value={ogDescription}
                        onChange={(e) => setOgDescription(e.target.value)}
                      />
                    </div>
                    <div>
                      <span className="text-gray-400 block mb-1">OG Image Link</span>
                      <input
                        type="text"
                        placeholder={featuredImage || "Default is Cover Image URL"}
                        className="w-full border border-gray-100 rounded-lg p-2.5 outline-none text-sm"
                        value={ogImage}
                        onChange={(e) => setOgImage(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Custom Schema.org Structured Data */}
                <div className="space-y-2">
                  <label className="text-xs font-extrabold text-gray-700 uppercase tracking-wider flex items-center justify-between">
                    <span>Custom Schema.org (JSON-LD)</span>
                    <FileCode className="h-4 w-4 text-gray-400" />
                  </label>
                  <textarea
                    placeholder='{"@context": "https://schema.org", "@type": "TechArticle", ...}'
                    rows={4}
                    className="w-full text-xs font-mono border border-gray-200 rounded-xl p-3 bg-white outline-none focus:border-brand-500"
                    value={schemaData}
                    onChange={(e) => setSchemaData(e.target.value)}
                  />
                  <p className="text-[10px] text-gray-400 leading-normal">
                    Insert advanced, custom schema to overwrite default JSON-LD structures. Must be a valid JSON string.
                  </p>
                </div>
              </div>
            )}

            {/* TAB 2: AI SEARCH EXPERIENCES AUDITING */}
            {activeTab === "ai" && (
              <div className="space-y-6 animate-fade-in">
                <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 text-xs text-amber-800 flex items-start gap-2.5">
                  <Sparkles className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                  <p className="font-medium leading-relaxed">
                    AI models like ChatGPT Search, Perplexity, and Gemini rely on structural semantics and core entity verification. See how your writing performs.
                  </p>
                </div>

                {/* Heading Hierarchy Analysis */}
                <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3 shadow-sm">
                  <h4 className="text-xs font-extrabold text-gray-800 uppercase tracking-wider flex items-center justify-between">
                    <span>Heading Hierarchy</span>
                    <span className="text-[10px] bg-brand-50 text-brand-600 rounded px-1.5 py-0.5">
                      {headingAnalysis.count} Found
                    </span>
                  </h4>

                  {headingAnalysis.valid ? (
                    <div className="text-xs text-emerald-600 font-bold flex items-center gap-1.5">
                      <CheckCircle className="h-4 w-4 shrink-0" />
                      Semantic Heading Nesting is Correct!
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-xs text-amber-600 font-bold flex items-center gap-1.5">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        Hierarchy issues found
                      </div>
                      <ul className="list-disc list-inside text-[11px] text-gray-500 space-y-1">
                        {headingAnalysis.issues.map((iss, i) => (
                          <li key={i}>{iss}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Readability Score */}
                <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3 shadow-sm">
                  <h4 className="text-xs font-extrabold text-gray-800 uppercase tracking-wider">
                    Readability & Flow
                  </h4>

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 font-semibold">Quality Level:</span>
                    <span className="text-xs font-extrabold text-emerald-600">
                      {readabilityAnalysis.status}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs font-semibold text-gray-400">
                    <span>Avg Sentence Length:</span>
                    <span className={readabilityAnalysis.avgSentLength > 20 ? "text-amber-500" : "text-gray-700"}>
                      {readabilityAnalysis.avgSentLength} words
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs font-semibold text-gray-400">
                    <span>Durable Paragraphs:</span>
                    <span>{readabilityAnalysis.paragraphs} blocks</span>
                  </div>
                </div>

                {/* Entities Scan results */}
                <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3 shadow-sm">
                  <h4 className="text-xs font-extrabold text-gray-800 uppercase tracking-wider">
                    Target Entity Density Mapping
                  </h4>
                  <p className="text-[10px] text-gray-400 leading-normal">
                    AI models scan pages for key high-priority industry entities to resolve knowledge requests. Ensure you use these:
                  </p>

                  <div className="space-y-2.5 pt-2">
                    {entityScanResult.map((ent, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="text-gray-700 font-bold flex items-center gap-1.5">
                          <span className={`h-2 w-2 rounded-full ${ent.required ? "bg-brand-500" : "bg-gray-400"}`} />
                          {ent.name}
                        </span>
                        <span className={`font-bold uppercase tracking-wide text-[9px] px-2 py-0.5 rounded-full ${ent.found ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                          {ent.found ? "Found" : "Missing"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: STRUCTURED FAQ BLOCKS, INTERNAL LINKS & RELATED */}
            {activeTab === "blocks" && (
              <div className="space-y-6 animate-fade-in">
                {/* 1. FAQ block builder */}
                <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-extrabold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                      <HelpCircle className="h-4 w-4 text-brand-500" /> Q&A FAQ Builder
                    </h4>
                    <button
                      type="button"
                      onClick={addFaq}
                      className="text-[10px] font-extrabold bg-brand-50 text-brand-600 px-2.5 py-1 rounded-lg hover:bg-brand-100 transition-colors"
                    >
                      + Add Block
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-400 leading-normal">
                    FAQs built here display in responsive accordion style inside articles AND are auto-translated into Google FAQPage structured Schema tags.
                  </p>

                  <div className="space-y-3">
                    {faqs.map((faq, idx) => (
                      <div key={idx} className="border border-gray-100 rounded-xl p-3 bg-gray-50/50 relative space-y-2.5">
                        <button
                          type="button"
                          onClick={() => removeFaq(idx)}
                          className="absolute top-1 right-2 text-red-500 hover:text-red-700 font-bold text-xs"
                          title="Delete FAQ block"
                        >
                          ×
                        </button>
                        <div>
                          <span className="text-[9px] font-black uppercase tracking-wider text-gray-400">
                            Question #{idx + 1}
                          </span>
                          <input
                            type="text"
                            placeholder="What is Lightning Invoice?"
                            className="w-full border border-gray-200 rounded-lg p-2 text-xs font-bold mt-1 outline-none bg-white focus:border-brand-500"
                            value={faq.question}
                            onChange={(e) => updateFaq(idx, "question", e.target.value)}
                          />
                        </div>
                        <div>
                          <span className="text-[9px] font-black uppercase tracking-wider text-gray-400">
                            Answer
                          </span>
                          <textarea
                            placeholder="A lightning invoice is a layer-2 transaction request..."
                            rows={2}
                            className="w-full border border-gray-200 rounded-lg p-2 text-xs mt-1 outline-none bg-white focus:border-brand-500 resize-none"
                            value={faq.answer}
                            onChange={(e) => updateFaq(idx, "answer", e.target.value)}
                          />
                        </div>
                      </div>
                    ))}

                    {faqs.length === 0 && (
                      <div className="text-center py-6 text-xs text-gray-400">
                        No FAQ blocks added. Keep conversational Q&A in mind.
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. Internal linking recommendations */}
                <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3 shadow-sm">
                  <h4 className="text-xs font-extrabold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Link2 className="h-4 w-4 text-brand-500" /> Internal Linking Suggestions
                  </h4>
                  <p className="text-[10px] text-gray-400 leading-normal">
                    Insert links in your text pointing to these related articles to pass SEO page-rank authority:
                  </p>

                  <div className="space-y-2.5 pt-2">
                    {internalLinkingSuggestions.map((art: any) => (
                      <div key={art.id} className="text-xs bg-gray-50 rounded-xl p-3 border border-gray-100 flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <span className="font-bold text-gray-800 line-clamp-2 leading-tight">
                            {art.title}
                          </span>
                          <span className="text-[9px] text-brand-600 font-extrabold uppercase mt-1 block">
                            /article/{art.slug || art.id}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const mdLink = `<a href="/article/${art.slug || art.id}">${art.title}</a>`;
                            navigator.clipboard.writeText(mdLink);
                            triggerToast("Copied HTML link to clipboard. Paste in the editor!");
                          }}
                          className="text-[9px] font-extrabold bg-brand-50 text-brand-600 px-2 py-1 rounded hover:bg-brand-100 transition-colors uppercase shrink-0"
                          title="Copy rich link tag"
                        >
                          Copy Link
                        </button>
                      </div>
                    ))}

                    {internalLinkingSuggestions.length === 0 && (
                      <div className="text-center py-4 text-xs text-gray-400">
                        No suggested links. Please configure an article category first.
                      </div>
                    )}
                  </div>
                </div>

                {/* 3. Related articles selector (check up to 3) */}
                <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3 shadow-sm">
                  <h4 className="text-xs font-extrabold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                    <BookOpen className="h-4 w-4 text-brand-500" /> Related Articles Selection
                  </h4>
                  <p className="text-[10px] text-gray-400 leading-normal">
                    Select up to 3 articles to display as recommendations at the bottom of this page:
                  </p>

                  <div className="space-y-2 max-h-48 overflow-y-auto pt-2 pr-1">
                    {allArticles.map((art: any) => {
                      const isChecked = relatedArticleIds.includes(art.id);
                      return (
                        <label
                          key={art.id}
                          className={`flex items-start gap-3 p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${isChecked ? "bg-brand-50/50 border-brand-200 text-gray-900 font-semibold" : "bg-white border-gray-100 text-gray-600 hover:bg-gray-50"}`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              if (isChecked) {
                                setRelatedArticleIds(relatedArticleIds.filter((id) => id !== art.id));
                              } else {
                                if (relatedArticleIds.length >= 3) {
                                  triggerToast("You can select up to 3 related articles only.");
                                  return;
                                }
                                setRelatedArticleIds([...relatedArticleIds, art.id]);
                              }
                            }}
                            className="mt-0.5 text-brand-600 border-gray-200 rounded focus:ring-brand-500"
                          />
                          <span className="line-clamp-2 leading-tight">{art.title}</span>
                        </label>
                      );
                    })}

                    {allArticles.length === 0 && (
                      <div className="text-center py-4 text-xs text-gray-400">
                        No other articles exist to map.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      {showToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-950 text-white font-bold text-sm px-5 py-3.5 rounded-2xl shadow-2xl border border-gray-800 flex items-center gap-2.5 animate-scale-up select-none">
          <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" />
          <span>{toastMessage}</span>
        </div>
      )}

      <MediaLibraryModal
        isOpen={isMediaModalOpen}
        onClose={() => setIsMediaModalOpen(false)}
        onSelect={handleMediaSelect}
        title={mediaTarget === "cover" ? "Select Cover Featured Image" : "Embed Inline Article Image"}
      />
    </div>
  );
}
