import Papa from "papaparse";
import { type User } from "@supabase/supabase-js";
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { supabase } from "./lib/supabase";

type NavView = "Dashboard" | "Campaigns" | "Leads" | "Messages" | "Settings";
type Tone = "Friendly" | "Professional" | "Direct";
type ApiTone = "friendly" | "professional" | "direct";
type Channel = "Email" | "LinkedIn DM" | "Cold DM";
type Language = "english" | "russian";
type LeadStatus = "new" | "contacted" | "replied" | "interested";

type GenerateMessageResponse = {
  message: string;
};

type SelectedLead = {
  id: string;
  name: string;
  company: string;
  role: string;
  website: string;
  email?: string;
};

type SupabaseLead = SelectedLead & {
  status: LeadStatus;
  user_id: string;
  created_at: string;
};

type MessageLead = {
  name: string;
  company: string;
  role: string;
  website: string;
  email?: string;
  status: LeadStatus;
} | null;

type MessageCampaign = {
  name?: string;
  target: string;
  offer: string;
  tone: string;
  channel: string;
} | null;

type SupabaseMessage = {
  id: string;
  content: string;
  created_at: string;
  lead_id: string | null;
  campaign_id: string | null;
  user_id: string;
  type?: "initial" | "follow_up" | string | null;
  parent_message_id?: string | null;
  sequence_number?: number | null;
  leads: MessageLead;
  campaigns: MessageCampaign;
};

type FollowUpType = "polite reminder" | "value add" | "final check-in";

type FollowUpFormState = {
  followUpType: FollowUpType;
  tone: ApiTone;
  language: Language;
};

type CampaignMessageLink = {
  id: string;
  lead_id: string | null;
};

type SupabaseCampaign = {
  id: string;
  name: string;
  target: string;
  offer: string;
  tone: string;
  channel: string;
  user_id: string;
  created_at: string;
  messages?: CampaignMessageLink[];
};

type LeadFormState = {
  name: string;
  company: string;
  role: string;
  website: string;
  email: string;
  status: LeadStatus;
};

type CsvLeadRow = LeadFormState;

type CsvLeadPreview = {
  fileName: string;
  validRows: CsvLeadRow[];
  skippedRows: number;
};

type RawCsvLeadRow = Record<string, unknown>;

type BulkGenerateFormState = {
  offer: string;
  tone: ApiTone;
  channel: Channel;
  language: Language;
};

type BulkGenerateProgress = {
  total: number;
  completed: number;
  success: number;
  failed: number;
};

type CampaignFormState = {
  name: string;
  target: string;
  offer: string;
  tone: ApiTone;
  channel: Channel;
};

type SaveGeneratedMessageInput = {
  content: string;
  target: string;
  offer: string;
  tone: ApiTone;
  channel: Channel;
  campaignId?: string | null;
  type?: "initial" | "follow_up";
  parentMessageId?: string | null;
  sequenceNumber?: number;
};

type AutoSaveStatus = "idle" | "saving" | "saved" | "failed";
type ThemeSetting = "light" | "dark" | "system";
type AuthMode = "login" | "signup";

type AppSettings = {
  autoSave: boolean;
  defaultTone: ApiTone;
  defaultChannel: Channel;
  defaultLanguage: Language;
  confirmDelete: boolean;
  compactMode: boolean;
  theme: ThemeSetting;
};

type SettingKey = keyof AppSettings;

const navItems: NavView[] = ["Dashboard", "Campaigns", "Leads", "Messages", "Settings"];
const tones: Tone[] = ["Friendly", "Professional", "Direct"];
const channels: Channel[] = ["Email", "LinkedIn DM", "Cold DM"];
const languages: { value: Language; label: string }[] = [
  { value: "english", label: "English" },
  { value: "russian", label: "Russian" },
];
const leadStatuses: LeadStatus[] = ["new", "contacted", "replied", "interested"];
const followUpTypes: FollowUpType[] = ["polite reminder", "value add", "final check-in"];
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
const toneApiValues: Record<Tone, ApiTone> = {
  Friendly: "friendly",
  Professional: "professional",
  Direct: "direct",
};

const settingKeys: SettingKey[] = [
  "autoSave",
  "defaultTone",
  "defaultChannel",
  "defaultLanguage",
  "confirmDelete",
  "compactMode",
  "theme",
];

const defaultSettings: AppSettings = {
  autoSave: true,
  defaultTone: "friendly",
  defaultChannel: "LinkedIn DM",
  defaultLanguage: "english",
  confirmDelete: true,
  compactMode: false,
  theme: "system",
};

const emptyLeadForm: LeadFormState = {
  name: "",
  company: "",
  role: "",
  website: "",
  email: "",
  status: "new",
};

const emptyCampaignForm: CampaignFormState = {
  name: "",
  target: "",
  offer: "",
  tone: "friendly",
  channel: "LinkedIn DM",
};

const navIconLabels: Record<NavView, string> = {
  Dashboard: "D",
  Campaigns: "C",
  Leads: "L",
  Messages: "M",
  Settings: "S",
};

const statusBadgeStyles: Record<LeadStatus, string> = {
  new: "border-sky-100 bg-sky-50 text-sky-700 dark:border-sky-400/15 dark:bg-sky-400/10 dark:text-sky-300",
  contacted: "border-amber-100 bg-amber-50 text-amber-700 dark:border-amber-400/15 dark:bg-amber-400/10 dark:text-amber-300",
  replied: "border-emerald-100 bg-emerald-50 text-emerald-700 dark:border-emerald-400/15 dark:bg-emerald-400/10 dark:text-emerald-300",
  interested: "border-violet-100 bg-violet-50 text-violet-700 dark:border-violet-400/15 dark:bg-violet-400/10 dark:text-violet-300",
};

function Spinner() {
  return (
    <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
  );
}

function getLeadTarget(lead: Pick<SelectedLead, "role" | "company">) {
  return `${lead.role} at ${lead.company}`;
}

function toSelectedLead(lead: SupabaseLead): SelectedLead {
  return {
    id: lead.id,
    name: lead.name,
    company: lead.company,
    role: lead.role,
    website: lead.website,
    email: lead.email,
  };
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;

  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }

  if (typeof error === "object" && error !== null) return JSON.stringify(error);
  return String(error);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatLeadStatus(status: LeadStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function normalizeCsvText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeCsvStatus(value: unknown): LeadStatus {
  const status = normalizeCsvText(value).toLowerCase();
  return leadStatuses.includes(status as LeadStatus) ? (status as LeadStatus) : "new";
}

function getLeadDuplicateKey(name: string, company: string) {
  return `${name.trim().toLowerCase()}::${company.trim().toLowerCase()}`;
}

function downloadCsv(filename: string, rows: Record<string, string>[]) {
  const csv = Papa.unparse(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function toDashboardTone(value: string): Tone {
  if (value === "professional") return "Professional";
  if (value === "direct") return "Direct";
  return "Friendly";
}

function toDashboardChannel(value: string): Channel {
  if (value === "Email" || value === "Cold DM" || value === "LinkedIn DM") {
    return value;
  }

  return "LinkedIn DM";
}

function toLanguage(value: string | null | undefined): Language {
  return value === "russian" ? "russian" : "english";
}

function detectMessageLanguage(content: string, fallback: Language): Language {
  return /[А-Яа-яЁё]/.test(content) ? "russian" : fallback;
}

function toThemeSetting(value: string | null): ThemeSetting {
  if (value === "light" || value === "dark" || value === "system") return value;
  return "system";
}

function shouldUseDarkTheme(theme: ThemeSetting) {
  if (theme === "dark") return true;
  if (theme === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyTheme(theme: ThemeSetting) {
  if (typeof window === "undefined") return;
  document.documentElement.classList.toggle("dark", shouldUseDarkTheme(theme));
}

function readStoredSettings(): AppSettings {
  if (typeof window === "undefined") return defaultSettings;

  const storedTone = window.localStorage.getItem("defaultTone");
  const storedChannel = window.localStorage.getItem("defaultChannel");
  const storedLanguage = window.localStorage.getItem("defaultLanguage");
  const storedTheme = window.localStorage.getItem("theme");

  return {
    autoSave: window.localStorage.getItem("autoSave") !== "false",
    defaultTone:
      storedTone === "professional" || storedTone === "direct" || storedTone === "friendly"
        ? storedTone
        : defaultSettings.defaultTone,
    defaultChannel: toDashboardChannel(storedChannel ?? defaultSettings.defaultChannel),
    defaultLanguage: toLanguage(storedLanguage),
    confirmDelete: window.localStorage.getItem("confirmDelete") !== "false",
    compactMode: window.localStorage.getItem("compactMode") === "true",
    theme: toThemeSetting(storedTheme),
  };
}

function persistSetting<Key extends SettingKey>(key: Key, value: AppSettings[Key]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, String(value));
}

function clearStoredSettings() {
  if (typeof window === "undefined") return;
  settingKeys.forEach((key) => window.localStorage.removeItem(key));
}

applyTheme(readStoredSettings().theme);

function Sidebar({
  activeView,
  onNavigate,
}: {
  activeView: NavView;
  onNavigate: (view: NavView) => void;
}) {
  return (
    <aside className="hidden min-h-screen w-72 shrink-0 border-r border-slate-200 bg-white px-4 py-5 shadow-[12px_0_40px_rgba(15,23,42,0.03)] backdrop-blur lg:block dark:border-white/[0.06] dark:bg-[#0F172A]/80 dark:shadow-lg dark:shadow-black/30">
      <div className="mb-8 rounded-3xl border border-slate-200 bg-slate-50 p-3 dark:border-white/[0.06] dark:bg-white/[0.04] dark:bg-gradient-to-b dark:from-white/[0.06] dark:to-transparent">
        <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-sm font-semibold text-white shadow-lg shadow-slate-300/70 dark:shadow-black/30">
          LF
        </div>
        <div>
          <div className="text-base font-semibold tracking-tight text-slate-950 dark:text-gray-200">LeadFlow</div>
          <div className="text-xs text-slate-500 dark:text-gray-400">AI sales workspace</div>
        </div>
        </div>
      </div>

      <nav className="space-y-1.5">
        {navItems.map((item) => (
          <button
            key={item}
            onClick={() => onNavigate(item)}
            className={`group flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-medium transition duration-200 ${
              item === activeView
                ? "bg-slate-950 text-white shadow-lg shadow-slate-300/70 dark:bg-gradient-to-r dark:from-blue-500/90 dark:to-indigo-500/90 dark:shadow-blue-500/20"
                : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-950 dark:text-gray-400 dark:hover:bg-white/[0.05] dark:hover:text-gray-100"
            }`}
          >
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-xl text-xs font-semibold transition ${
                item === activeView
                  ? "bg-white/15 text-white"
                  : "bg-white text-slate-500 ring-1 ring-slate-200 group-hover:text-slate-950 dark:bg-white/[0.04] dark:text-gray-500 dark:ring-white/[0.06] dark:group-hover:text-gray-100"
              }`}
            >
              {navIconLabels[item]}
            </span>
            <span>{item}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}

function MobileTopBar({
  activeView,
  onNavigate,
}: {
  activeView: NavView;
  onNavigate: (view: NavView) => void;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white px-4 py-4 shadow-sm backdrop-blur lg:hidden dark:border-white/[0.06] dark:bg-[#0F172A]/85 dark:shadow-lg dark:shadow-black/30">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-950 text-xs font-semibold text-white shadow-sm">
          LF
        </div>
        <div className="text-base font-semibold tracking-tight text-slate-950 dark:text-gray-200">LeadFlow</div>
      </div>
      <nav className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {navItems.map((item) => (
          <button
            key={item}
            onClick={() => onNavigate(item)}
            className={`shrink-0 rounded-2xl px-3 py-2 text-sm font-medium transition ${
              item === activeView
                ? "bg-slate-950 text-white shadow-sm dark:bg-gradient-to-r dark:from-blue-500 dark:to-indigo-500 dark:shadow-blue-500/20"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200/80 hover:text-slate-950 dark:bg-white/[0.04] dark:text-gray-400 dark:hover:bg-white/[0.08] dark:hover:text-gray-100"
            }`}
          >
            {item}
          </button>
        ))}
      </nav>
    </header>
  );
}

function StatCard({ label, value, trend }: { label: string; value: string; trend: string }) {
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_14px_40px_rgba(15,23,42,0.05)] transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_20px_60px_rgba(15,23,42,0.08)] dark:border-white/[0.06] dark:bg-[#111827]/80 dark:bg-gradient-to-b dark:from-white/[0.06] dark:to-white/[0.02] dark:shadow-lg dark:shadow-black/30 dark:hover:border-white/10">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-500">{label}</div>
      <div className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 dark:text-gray-200">{value}</div>
      <div className="mt-1 text-xs font-medium text-slate-500 dark:text-gray-400">{trend}</div>
    </article>
  );
}

function FieldLabel({ children }: { children: string }) {
  return <span className="text-sm font-semibold text-slate-700 dark:text-gray-300">{children}</span>;
}

function ToggleSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 rounded-full shadow-inner outline-none transition focus:ring-4 focus:ring-sky-100 ${
        checked ? "bg-blue-600" : "bg-slate-200 dark:bg-slate-700"
      }`}
    >
      <span
        className={`absolute top-1 h-5 w-5 rounded-full bg-white dark:bg-slate-900 shadow-sm transition ${
          checked ? "left-6" : "left-1"
        }`}
      />
    </button>
  );
}

function Generator({
  target,
  offer,
  tone,
  channel,
  language,
  selectedLead,
  isLoading,
  onTargetChange,
  onOfferChange,
  onToneChange,
  onChannelChange,
  onLanguageChange,
  onGenerate,
}: {
  target: string;
  offer: string;
  tone: Tone;
  channel: Channel;
  language: Language;
  selectedLead: SelectedLead | null;
  isLoading: boolean;
  onTargetChange: (value: string) => void;
  onOfferChange: (value: string) => void;
  onToneChange: (value: Tone) => void;
  onChannelChange: (value: Channel) => void;
  onLanguageChange: (value: Language) => void;
  onGenerate: () => void;
}) {
  const canGenerate = Boolean(target.trim() && offer.trim()) && !isLoading;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onGenerate();
  }

  return (
    <section className="rounded-3xl border border-sky-200/80 bg-white p-5 shadow-[0_26px_90px_rgba(14,165,233,0.16)] ring-1 ring-sky-100/60 transition duration-200 hover:shadow-[0_32px_100px_rgba(14,165,233,0.2)] sm:p-6 dark:border-blue-400/15 dark:bg-[#111827]/85 dark:bg-gradient-to-b dark:from-white/[0.07] dark:to-white/[0.025] dark:shadow-lg dark:shadow-black/30 dark:ring-1 dark:ring-white/[0.04] dark:backdrop-blur-xl dark:hover:border-blue-400/25 dark:hover:shadow-blue-950/20">
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-2 w-fit rounded-2xl border border-sky-100 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 shadow-sm dark:border-blue-400/15 dark:bg-blue-400/10 dark:text-blue-300">
            Message generator
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-gray-200">
            Campaign Message
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-gray-400">
            Build a short outbound draft for a specific audience and offer.
          </p>
          {selectedLead ? (
            <div className="mt-3 w-fit rounded-2xl border border-sky-200 bg-sky-50/80 px-3 py-2 text-xs font-semibold text-sky-800 shadow-sm dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-200">
              Using: {selectedLead.name} / {selectedLead.role} / {selectedLead.company}
            </div>
          ) : null}
        </div>
        <span className="w-fit rounded-2xl border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm dark:border-white/[0.06] dark:bg-white/[0.04] dark:text-gray-300">
          {channel} · {language === "russian" ? "Russian" : "English"}
        </span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid gap-4 xl:grid-cols-2">
          <label className="space-y-2">
            <FieldLabel>Target Audience</FieldLabel>
            <input
              value={target}
              onChange={(event) => onTargetChange(event.target.value)}
              placeholder="e.g. SaaS founders in USA"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 hover:bg-white focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-200 dark:placeholder:text-gray-500 dark:hover:bg-white/[0.07] dark:focus:border-blue-400/70 dark:focus:bg-white/[0.06] dark:focus:ring-2 dark:focus:ring-blue-500/40"
            />
          </label>

          <label className="space-y-2">
            <FieldLabel>Offer</FieldLabel>
            <input
              value={offer}
              onChange={(event) => onOfferChange(event.target.value)}
              placeholder="e.g. Web design services"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 hover:bg-white focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-200 dark:placeholder:text-gray-500 dark:hover:bg-white/[0.07] dark:focus:border-blue-400/70 dark:focus:bg-white/[0.06] dark:focus:ring-2 dark:focus:ring-blue-500/40"
            />
          </label>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <label className="space-y-2">
            <FieldLabel>Tone</FieldLabel>
            <select
              value={tone}
              onChange={(event) => onToneChange(event.target.value as Tone)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition hover:bg-white focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-200 dark:hover:bg-white/[0.07] dark:focus:border-blue-400/70 dark:focus:bg-white/[0.06] dark:focus:ring-2 dark:focus:ring-blue-500/40"
            >
              {tones.map((toneOption) => (
                <option key={toneOption}>{toneOption}</option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <FieldLabel>Channel</FieldLabel>
            <select
              value={channel}
              onChange={(event) => onChannelChange(event.target.value as Channel)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition hover:bg-white focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-200 dark:hover:bg-white/[0.07] dark:focus:border-blue-400/70 dark:focus:bg-white/[0.06] dark:focus:ring-2 dark:focus:ring-blue-500/40"
            >
              {channels.map((channelOption) => (
                <option key={channelOption}>{channelOption}</option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <FieldLabel>Language</FieldLabel>
            <select
              value={language}
              onChange={(event) => onLanguageChange(event.target.value as Language)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition hover:bg-white focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-200 dark:hover:bg-white/[0.07] dark:focus:border-blue-400/70 dark:focus:bg-white/[0.06] dark:focus:ring-2 dark:focus:ring-blue-500/40"
            >
              {languages.map((languageOption) => (
                <option key={languageOption.value} value={languageOption.value}>
                  {languageOption.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <button
          type="submit"
          disabled={!canGenerate}
          className="flex w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 text-base font-semibold text-white shadow-xl shadow-blue-600/25 transition duration-200 hover:-translate-y-0.5 hover:from-blue-500 hover:to-indigo-500 hover:shadow-2xl hover:shadow-blue-600/30 active:translate-y-0 active:scale-[0.99] active:from-blue-700 active:to-indigo-700 focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:translate-y-0 disabled:scale-100 disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none dark:from-blue-500 dark:to-indigo-500 dark:shadow-lg dark:shadow-blue-500/20 dark:hover:from-blue-400 dark:hover:to-indigo-400 dark:hover:shadow-blue-500/30 dark:focus:ring-2 dark:focus:ring-blue-500/40 dark:disabled:from-slate-700 dark:disabled:to-slate-700"
        >
          {isLoading ? (
            <>
              <Spinner />
              Generating...
            </>
          ) : (
            "Generate Message"
          )}
        </button>
      </form>
    </section>
  );
}

function MessagePanel({
  message,
  isLoading,
  isSaving,
  saveError,
  autoSaveStatus,
  isCurrentMessageSaved,
  selectedLead,
  hasGeneratedMessage,
  onCopy,
  onRegenerate,
  onSave,
}: {
  message: string;
  isLoading: boolean;
  isSaving: boolean;
  saveError: string;
  autoSaveStatus: AutoSaveStatus;
  isCurrentMessageSaved: boolean;
  selectedLead: SelectedLead | null;
  hasGeneratedMessage: boolean;
  onCopy: () => void;
  onRegenerate: () => void;
  onSave: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [visibleMessage, setVisibleMessage] = useState(message);

  useEffect(() => {
    if (!message) {
      setVisibleMessage("");
      return;
    }

    setVisibleMessage("");
    let index = 0;
    const intervalId = window.setInterval(() => {
      index += 4;
      setVisibleMessage(message.slice(0, index));
      if (index >= message.length) window.clearInterval(intervalId);
    }, 14);

    return () => window.clearInterval(intervalId);
  }, [message]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [visibleMessage]);

  return (
    <section
      className={`rounded-3xl border bg-white p-5 shadow-[0_20px_70px_rgba(15,23,42,0.07)] transition duration-200 sm:p-6 dark:bg-[#111827]/85 dark:bg-gradient-to-b dark:from-white/[0.06] dark:to-white/[0.02] dark:shadow-lg dark:shadow-black/30 dark:backdrop-blur-xl ${
        hasGeneratedMessage
          ? "border-emerald-200 shadow-[0_26px_90px_rgba(16,185,129,0.16)] ring-1 ring-emerald-100 dark:border-emerald-400/20 dark:ring-emerald-400/10 dark:shadow-emerald-950/20"
          : "border-slate-200 hover:border-slate-300 dark:border-white/[0.06] dark:hover:border-white/10"
      }`}
    >
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight text-slate-950 dark:text-gray-200">
              Generated Message
            </h2>
            {hasGeneratedMessage ? (
              <span className="rounded-2xl bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                Generated just now
              </span>
            ) : null}
            {isSaving ? (
              <span className="rounded-2xl bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
                Saving...
              </span>
            ) : null}
            {autoSaveStatus === "saved" ? (
              <span className="rounded-2xl bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                Saved automatically
              </span>
            ) : null}
            {autoSaveStatus === "failed" ? (
              <span className="rounded-2xl bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
                Auto-save failed
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">Review, copy, or save the latest draft.</p>
          {selectedLead ? (
            <p className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 dark:border-white/[0.06] dark:bg-white/[0.04] dark:text-gray-300">
              Generated for: {selectedLead.name} · {selectedLead.role} at{" "}
              {selectedLead.company}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onCopy}
            disabled={!message || isLoading}
            className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950 disabled:translate-y-0 disabled:cursor-not-allowed disabled:text-slate-300 dark:border-white/[0.06] dark:bg-white/[0.04] dark:text-gray-300 dark:shadow-black/20 dark:hover:border-white/10 dark:hover:bg-white/[0.08] dark:hover:text-gray-100"
          >
            Copy
          </button>
          <button
            type="button"
            onClick={onRegenerate}
            disabled={!message || isLoading}
            className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950 disabled:translate-y-0 disabled:cursor-not-allowed disabled:text-slate-300 dark:border-white/[0.06] dark:bg-white/[0.04] dark:text-gray-300 dark:shadow-black/20 dark:hover:border-white/10 dark:hover:bg-white/[0.08] dark:hover:text-gray-100"
          >
            Regenerate
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!message || isLoading || isSaving || isCurrentMessageSaved}
            className="rounded-2xl bg-slate-950 px-3 py-2 text-sm font-semibold text-white shadow-lg shadow-slate-300/70 transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none dark:bg-gradient-to-r dark:from-blue-500 dark:to-indigo-500 dark:shadow-blue-500/20 dark:hover:from-blue-400 dark:hover:to-indigo-400 dark:hover:shadow-blue-500/30 dark:disabled:from-slate-700 dark:disabled:to-slate-700"
          >
            {isCurrentMessageSaved ? "Saved" : isSaving ? "Saving..." : "Save Message"}
          </button>
        </div>
      </div>

      <textarea
        ref={textareaRef}
        readOnly
        value={
          visibleMessage ||
          "Your generated message will appear here after you add a target audience and offer."
        }
        className="min-h-56 w-full resize-none overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-slate-900 shadow-inner outline-none transition dark:border-white/[0.08] dark:bg-[#0B1220]/70 dark:text-gray-200 dark:shadow-inner dark:shadow-black/30"
      />
      <div className="mt-3 text-right text-xs font-medium text-slate-500 dark:text-gray-500">
        {visibleMessage.length} characters
      </div>
      {saveError ? (
        <div className="mt-3 rounded-2xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
          {saveError}
        </div>
      ) : null}
    </section>
  );
}

function DashboardLeadsTable({
  leads,
  selectedLeadId,
  isLeadsLoading,
  leadsError,
  isLoading,
  canGenerateForLead,
  onSelectLead,
  onGenerateForLead,
}: {
  leads: SupabaseLead[];
  selectedLeadId: string | null;
  isLeadsLoading: boolean;
  leadsError: string;
  isLoading: boolean;
  canGenerateForLead: boolean;
  onSelectLead: (lead: SupabaseLead) => void;
  onGenerateForLead: (lead: SupabaseLead) => void;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)] sm:p-6 dark:border-white/[0.06] dark:bg-[#111827]/80 dark:bg-gradient-to-b dark:from-white/[0.05] dark:to-white/[0.02] dark:shadow-lg dark:shadow-black/30 dark:backdrop-blur-xl">
      <div className="mb-5">
        <h2 className="text-lg font-semibold tracking-tight text-slate-950 dark:text-gray-200">Leads</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">Real Supabase leads ready for message generation.</p>
      </div>

      {leadsError ? (
        <div className="mb-4 rounded-2xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
          {leadsError}
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-separate border-spacing-0 text-left text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-500 dark:bg-slate-950/40 dark:text-slate-400">
              {["Name", "Company", "Role", "Website", "Status", "Action"].map((heading) => (
                <th key={heading} className="border-y border-slate-200 px-4 py-3 font-semibold first:rounded-l-2xl first:border-l last:rounded-r-2xl last:border-r dark:border-slate-800">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLeadsLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  Loading leads...
                </td>
              </tr>
            ) : null}
            {!isLeadsLoading && leads.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  No leads yet. Add a lead from the Leads page to generate a message here.
                </td>
              </tr>
            ) : null}
            {!isLeadsLoading && leads.map((lead) => {
              const isSelected = selectedLeadId === lead.id;
              const cellClass = `border-b px-4 py-4 transition ${
                isSelected
                  ? "border-sky-100 bg-sky-50 dark:border-blue-400/20 dark:bg-blue-500/10"
                  : "border-slate-100 bg-transparent group-hover:bg-slate-50 dark:border-slate-800/70 dark:bg-transparent dark:group-hover:bg-white/5 dark:group-hover:text-slate-100"
              }`;

              return (
                <tr
                  key={lead.id}
                  onClick={() => onSelectLead(lead)}
                  className="group cursor-pointer"
                >
                  <td className={`${cellClass} font-medium text-slate-950 dark:text-slate-100`}>{lead.name}</td>
                  <td className={`${cellClass} text-slate-700 dark:text-slate-300`}>{lead.company}</td>
                  <td className={`${cellClass} text-slate-600 dark:text-slate-400`}>{lead.role}</td>
                  <td className={`${cellClass} text-slate-600 dark:text-slate-400`}>{lead.website}</td>
                  <td className={cellClass}>
                    <span
                      className={`rounded-2xl border px-3 py-1 text-xs font-semibold ${
                        statusBadgeStyles[lead.status]
                      }`}
                    >
                      {formatLeadStatus(lead.status)}
                    </span>
                  </td>
                  <td className={cellClass}>
                    <button
                      type="button"
                      disabled={!canGenerateForLead || isLoading}
                      onClick={(event) => {
                        event.stopPropagation();
                        onGenerateForLead(lead);
                      }}
                      className="rounded-2xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-slate-300/60 transition hover:-translate-y-0.5 hover:bg-blue-700 active:translate-y-0 disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none dark:bg-gradient-to-r dark:from-blue-500 dark:to-indigo-500 dark:shadow-blue-500/20 dark:hover:from-blue-400 dark:hover:to-indigo-400 dark:hover:shadow-blue-500/30 dark:disabled:from-slate-700 dark:disabled:to-slate-700"
                    >
                      Generate for this lead
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function LeadsPage({
  leads,
  isLoading,
  error,
  importSuccess,
  bulkSuccess,
  highlightedLeadId,
  selectedLeadIds,
  isFormOpen,
  isImportOpen,
  isBulkGenerateOpen,
  form,
  isSubmitting,
  importPreview,
  importError,
  isImporting,
  bulkForm,
  isBulkGenerating,
  bulkProgress,
  bulkError,
  onOpenForm,
  onCloseForm,
  onOpenImport,
  onCloseImport,
  onOpenBulkGenerate,
  onCloseBulkGenerate,
  onFormChange,
  onBulkFormChange,
  onSubmit,
  onCsvFileChange,
  onConfirmImport,
  onConfirmBulkGenerate,
  onToggleLeadSelection,
  onToggleAllVisible,
  onDelete,
  onStatusChange,
}: {
  leads: SupabaseLead[];
  isLoading: boolean;
  error: string;
  importSuccess: string;
  bulkSuccess: string;
  highlightedLeadId: string | null;
  selectedLeadIds: string[];
  isFormOpen: boolean;
  isImportOpen: boolean;
  isBulkGenerateOpen: boolean;
  form: LeadFormState;
  isSubmitting: boolean;
  importPreview: CsvLeadPreview | null;
  importError: string;
  isImporting: boolean;
  bulkForm: BulkGenerateFormState;
  isBulkGenerating: boolean;
  bulkProgress: BulkGenerateProgress;
  bulkError: string;
  onOpenForm: () => void;
  onCloseForm: () => void;
  onOpenImport: () => void;
  onCloseImport: () => void;
  onOpenBulkGenerate: () => void;
  onCloseBulkGenerate: () => void;
  onFormChange: (field: keyof LeadFormState, value: string) => void;
  onBulkFormChange: (field: keyof BulkGenerateFormState, value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCsvFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onConfirmImport: () => void;
  onConfirmBulkGenerate: () => void;
  onToggleLeadSelection: (leadId: string) => void;
  onToggleAllVisible: () => void;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, status: LeadStatus) => void;
}) {
  const selectedLeadIdSet = new Set(selectedLeadIds);
  const allVisibleSelected =
    leads.length > 0 && leads.every((lead) => selectedLeadIdSet.has(lead.id));
  const hasSelectedLeads = selectedLeadIds.length > 0;

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-sky-600">Leads</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 dark:text-slate-100">
            Lead database
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onOpenBulkGenerate}
            disabled={!hasSelectedLeads || isBulkGenerating}
            className="w-fit rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-xl hover:shadow-blue-600/25 disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
          >
            {isBulkGenerating ? "Generating..." : "Generate messages for selected"}
          </button>
          <button
            type="button"
            onClick={onOpenImport}
            className="w-fit rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 dark:hover:bg-slate-800 hover:text-slate-950 dark:hover:text-slate-100"
          >
            Import CSV
          </button>
          <button
            type="button"
            onClick={onOpenForm}
            className="w-fit rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-slate-300/70 dark:shadow-black/30 transition hover:-translate-y-0.5 hover:bg-slate-800"
          >
            Add Lead
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      {importSuccess ? (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {importSuccess}
        </div>
      ) : null}
      {bulkSuccess ? (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {bulkSuccess}
        </div>
      ) : null}

      <section className="rounded-3xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)] sm:p-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm font-medium text-slate-600 dark:text-slate-300">
            {selectedLeadIds.length} selected
          </div>
          <button
            type="button"
            onClick={onToggleAllVisible}
            disabled={leads.length === 0 || isLoading}
            className="w-fit rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 dark:hover:bg-slate-800 disabled:translate-y-0 disabled:cursor-not-allowed disabled:text-slate-300"
          >
            {allVisibleSelected ? "Clear visible" : "Select all visible"}
          </button>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-sm font-medium text-slate-500 dark:text-slate-400">
            Loading leads...
          </div>
        ) : leads.length === 0 ? (
          <div className="py-12 text-center text-sm font-medium text-slate-500 dark:text-slate-400">
            No leads yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-separate border-spacing-0 text-left text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-500 dark:bg-slate-950/40 dark:text-slate-400">
                  <th className="border-y border-l border-slate-200 dark:border-slate-800 px-4 py-3 font-semibold first:rounded-l-2xl">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={onToggleAllVisible}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:checked:border-blue-500 dark:checked:bg-blue-500"
                    />
                  </th>
                  {["Name", "Company", "Role", "Website", "Email", "Status", "Created At", "Actions"].map(
                    (heading) => (
                      <th
                        key={heading}
                        className="border-y border-slate-200 dark:border-slate-800 px-4 py-3 font-semibold last:rounded-r-2xl last:border-r"
                      >
                        {heading}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => {
                  const isHighlighted = highlightedLeadId === lead.id;
                  const cellClass = `border-b px-4 py-4 transition ${
                    isHighlighted
                      ? "border-sky-100 bg-sky-50 dark:border-blue-400/20 dark:bg-blue-500/10"
                      : "border-slate-100 bg-transparent group-hover:bg-slate-50 dark:border-slate-800/70 dark:bg-transparent dark:group-hover:bg-white/5 dark:group-hover:text-slate-100"
                  }`;

                  return (
                    <tr key={lead.id} className="group">
                      <td className={cellClass}>
                        <input
                          type="checkbox"
                          checked={selectedLeadIdSet.has(lead.id)}
                          onChange={() => onToggleLeadSelection(lead.id)}
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:checked:border-blue-500 dark:checked:bg-blue-500"
                        />
                      </td>
                      <td className={`${cellClass} font-medium text-slate-950 dark:text-slate-100`}>
                        {lead.name}
                      </td>
                      <td className={`${cellClass} text-slate-700 dark:text-slate-300`}>{lead.company}</td>
                      <td className={`${cellClass} text-slate-600 dark:text-slate-400`}>{lead.role}</td>
                      <td className={`${cellClass} text-slate-600 dark:text-slate-400`}>{lead.website}</td>
                      <td className={`${cellClass} text-slate-600 dark:text-slate-400`}>{lead.email || "-"}</td>
                      <td className={cellClass}>
                        <select
                          value={lead.status}
                          onChange={(event) =>
                            onStatusChange(lead.id, event.target.value as LeadStatus)
                          }
                          className={`rounded-2xl border px-3 py-2 text-xs font-semibold outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100 ${statusBadgeStyles[lead.status]} dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-400 dark:focus:ring-blue-500/30`}
                        >
                          {leadStatuses.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className={`${cellClass} text-slate-600 dark:text-slate-400`}>
                        {formatDate(lead.created_at)}
                      </td>
                      <td className={cellClass}>
                        <button
                          type="button"
                          onClick={() => onDelete(lead.id)}
                          className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition hover:-translate-y-0.5 hover:border-red-300 hover:bg-red-100 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isFormOpen ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/30 px-4 backdrop-blur-sm">
          <form
            onSubmit={onSubmit}
            className="w-full max-w-xl rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl shadow-slate-950/10 dark:shadow-black/40"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-slate-950 dark:text-slate-100">Add Lead</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Create a lead in Supabase.</p>
              </div>
              <button
                type="button"
                onClick={onCloseForm}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-800 dark:hover:bg-slate-800 hover:text-slate-950 dark:hover:text-slate-100"
              >
                Close
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2">
                <FieldLabel>Name</FieldLabel>
                <input
                  value={form.name}
                  onChange={(event) => onFormChange("name", event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 px-4 py-3 text-sm outline-none transition hover:bg-white dark:hover:bg-slate-950 focus:border-sky-400 focus:bg-white dark:focus:bg-slate-950 focus:ring-4 focus:ring-sky-100"
                />
              </label>
              <label className="space-y-2">
                <FieldLabel>Company</FieldLabel>
                <input
                  value={form.company}
                  onChange={(event) => onFormChange("company", event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 px-4 py-3 text-sm outline-none transition hover:bg-white dark:hover:bg-slate-950 focus:border-sky-400 focus:bg-white dark:focus:bg-slate-950 focus:ring-4 focus:ring-sky-100"
                />
              </label>
              <label className="space-y-2">
                <FieldLabel>Role</FieldLabel>
                <input
                  value={form.role}
                  onChange={(event) => onFormChange("role", event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 px-4 py-3 text-sm outline-none transition hover:bg-white dark:hover:bg-slate-950 focus:border-sky-400 focus:bg-white dark:focus:bg-slate-950 focus:ring-4 focus:ring-sky-100"
                />
              </label>
              <label className="space-y-2">
                <FieldLabel>Website</FieldLabel>
                <input
                  value={form.website}
                  onChange={(event) => onFormChange("website", event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 px-4 py-3 text-sm outline-none transition hover:bg-white dark:hover:bg-slate-950 focus:border-sky-400 focus:bg-white dark:focus:bg-slate-950 focus:ring-4 focus:ring-sky-100"
                />
              </label>
              <label className="space-y-2">
                <FieldLabel>Email</FieldLabel>
                <input
                  value={form.email}
                  onChange={(event) => onFormChange("email", event.target.value)}
                  placeholder="name@company.com"
                  className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 px-4 py-3 text-sm outline-none transition hover:bg-white dark:hover:bg-slate-950 focus:border-sky-400 focus:bg-white dark:focus:bg-slate-950 focus:ring-4 focus:ring-sky-100"
                />
              </label>
              <label className="space-y-2">
                <FieldLabel>Status</FieldLabel>
                <select
                  value={form.status}
                  onChange={(event) => onFormChange("status", event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 px-4 py-3 text-sm outline-none transition hover:bg-white dark:hover:bg-slate-950 focus:border-sky-400 focus:bg-white dark:focus:bg-slate-950 focus:ring-4 focus:ring-sky-100"
                >
                  {leadStatuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-6 w-full rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:-translate-y-0.5 hover:bg-blue-700 disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
            >
              {isSubmitting ? "Saving..." : "Create Lead"}
            </button>
          </form>
        </div>
      ) : null}

      {isImportOpen ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/30 px-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl shadow-slate-950/10 dark:shadow-black/40">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-slate-950 dark:text-slate-100">
                  Import leads from CSV
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Required columns: name, company. Optional columns: role, website, email, status.
                </p>
              </div>
              <button
                type="button"
                onClick={onCloseImport}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-800 dark:hover:bg-slate-800 hover:text-slate-950 dark:hover:text-slate-100"
              >
                Close
              </button>
            </div>

            <label className="block space-y-2">
              <FieldLabel>CSV file</FieldLabel>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={onCsvFileChange}
                className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 text-sm text-slate-700 dark:text-slate-200 outline-none transition file:mr-4 file:rounded-2xl file:border-0 file:bg-slate-950 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-slate-800 focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
              />
            </label>

            {importError ? (
              <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                {importError}
              </div>
            ) : null}

            {importPreview ? (
              <div className="mt-5 space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 p-4">
                    <div className="text-xs font-medium uppercase text-slate-400 dark:text-slate-500">File</div>
                    <div className="mt-1 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {importPreview.fileName}
                    </div>
                  </div>
                  <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-4 shadow-sm">
                    <div className="text-xs font-medium uppercase text-emerald-600">Valid rows</div>
                    <div className="mt-1 text-2xl font-semibold text-emerald-700">
                      {importPreview.validRows.length}
                    </div>
                  </div>
                  <div className="rounded-3xl border border-amber-100 bg-amber-50 p-4 shadow-sm">
                    <div className="text-xs font-medium uppercase text-amber-600">Skipped rows</div>
                    <div className="mt-1 text-2xl font-semibold text-amber-700">
                      {importPreview.skippedRows}
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                  <table className="w-full min-w-[620px] text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500 dark:bg-slate-950/40 dark:text-slate-400">
                      <tr>
                        {["Name", "Company", "Role", "Website", "Email", "Status"].map((heading) => (
                          <th key={heading} className="px-4 py-3 font-medium">
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.validRows.slice(0, 5).map((row, index) => (
                        <tr key={`${row.name}-${row.company}-${index}`} className="border-t border-slate-100 bg-transparent transition hover:bg-slate-50 dark:border-slate-800/70 dark:bg-transparent dark:hover:bg-white/5 dark:hover:text-slate-100">
                          <td className="px-4 py-3 font-medium text-slate-950 dark:text-slate-100">{row.name}</td>
                          <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{row.company}</td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{row.role || "-"}</td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{row.website || "-"}</td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{row.email || "-"}</td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{row.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <button
                  type="button"
                  onClick={onConfirmImport}
                  disabled={isImporting || importPreview.validRows.length === 0}
                  className="w-full rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:-translate-y-0.5 hover:bg-blue-700 disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
                >
                  {isImporting ? "Importing..." : "Confirm import"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {isBulkGenerateOpen ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/30 px-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl shadow-slate-950/10 dark:shadow-black/40">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-slate-950 dark:text-slate-100">
                  Generate messages
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Create and save messages for {selectedLeadIds.length} selected lead
                  {selectedLeadIds.length === 1 ? "" : "s"}.
                </p>
              </div>
              <button
                type="button"
                onClick={onCloseBulkGenerate}
                disabled={isBulkGenerating}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-800 dark:hover:bg-slate-800 hover:text-slate-950 dark:hover:text-slate-100 disabled:cursor-not-allowed disabled:text-slate-300"
              >
                Close
              </button>
            </div>

            <div className="space-y-4">
              <label className="space-y-2">
                <FieldLabel>Offer</FieldLabel>
                <input
                  value={bulkForm.offer}
                  onChange={(event) => onBulkFormChange("offer", event.target.value)}
                  placeholder="e.g. Web design services"
                  className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 px-4 py-3 text-sm outline-none transition hover:bg-white dark:hover:bg-slate-950 focus:border-sky-400 focus:bg-white dark:focus:bg-slate-950 focus:ring-4 focus:ring-sky-100"
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2">
                  <FieldLabel>Tone</FieldLabel>
                  <select
                    value={bulkForm.tone}
                    onChange={(event) => onBulkFormChange("tone", event.target.value)}
                    className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 px-4 py-3 text-sm outline-none transition hover:bg-white dark:hover:bg-slate-950 focus:border-sky-400 focus:bg-white dark:focus:bg-slate-950 focus:ring-4 focus:ring-sky-100"
                  >
                    <option value="friendly">friendly</option>
                    <option value="professional">professional</option>
                    <option value="direct">direct</option>
                  </select>
                </label>

                <label className="space-y-2">
                  <FieldLabel>Channel</FieldLabel>
                  <select
                    value={bulkForm.channel}
                    onChange={(event) => onBulkFormChange("channel", event.target.value)}
                    className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 px-4 py-3 text-sm outline-none transition hover:bg-white dark:hover:bg-slate-950 focus:border-sky-400 focus:bg-white dark:focus:bg-slate-950 focus:ring-4 focus:ring-sky-100"
                  >
                    {channels.map((channelOption) => (
                      <option key={channelOption} value={channelOption}>
                        {channelOption}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2 sm:col-span-2">
                  <FieldLabel>Language</FieldLabel>
                  <select
                    value={bulkForm.language}
                    onChange={(event) => onBulkFormChange("language", event.target.value)}
                    className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 px-4 py-3 text-sm outline-none transition hover:bg-white dark:hover:bg-slate-950 focus:border-sky-400 focus:bg-white dark:focus:bg-slate-950 focus:ring-4 focus:ring-sky-100"
                  >
                    {languages.map((languageOption) => (
                      <option key={languageOption.value} value={languageOption.value}>
                        {languageOption.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            {bulkError ? (
              <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                {bulkError}
              </div>
            ) : null}

            {isBulkGenerating || bulkProgress.total > 0 ? (
              <div className="mt-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4">
                <div className="text-sm font-semibold text-slate-950 dark:text-slate-100">
                  Generating {bulkProgress.completed} / {bulkProgress.total}
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                  <div
                    className="h-full rounded-full bg-blue-600 transition-all"
                    style={{
                      width:
                        bulkProgress.total === 0
                          ? "0%"
                          : `${(bulkProgress.completed / bulkProgress.total) * 100}%`,
                    }}
                  />
                </div>
                <div className="mt-3 flex gap-4 text-sm text-slate-600 dark:text-slate-300">
                  <span>Success: {bulkProgress.success}</span>
                  <span>Failed: {bulkProgress.failed}</span>
                </div>
              </div>
            ) : null}

            <button
              type="button"
              onClick={onConfirmBulkGenerate}
              disabled={isBulkGenerating || !bulkForm.offer.trim() || selectedLeadIds.length === 0}
              className="mt-6 w-full rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:-translate-y-0.5 hover:bg-blue-700 disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
            >
              {isBulkGenerating ? "Generating..." : "Confirm generation"}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function MessagesPage({
  messages,
  campaigns,
  isLoading,
  error,
  search,
  statusFilter,
  campaignFilter,
  copiedMessageId,
  onSearchChange,
  onStatusFilterChange,
  onCampaignFilterChange,
  onOpenLead,
  onLeadStatusChange,
  onSendEmail,
  followUpMessage,
  followUpForm,
  isFollowUpOpen,
  isGeneratingFollowUp,
  followUpError,
  onOpenFollowUp,
  onCloseFollowUp,
  onFollowUpFormChange,
  onGenerateFollowUp,
  onCopy,
  onDelete,
}: {
  messages: SupabaseMessage[];
  campaigns: SupabaseCampaign[];
  isLoading: boolean;
  error: string;
  search: string;
  statusFilter: "all" | LeadStatus;
  campaignFilter: string;
  copiedMessageId: string | null;
  onSearchChange: (value: string) => void;
  onStatusFilterChange: (value: "all" | LeadStatus) => void;
  onCampaignFilterChange: (value: string) => void;
  onOpenLead: (message: SupabaseMessage) => void;
  onLeadStatusChange: (leadId: string, status: LeadStatus) => void;
  onSendEmail: (message: SupabaseMessage) => void;
  followUpMessage: SupabaseMessage | null;
  followUpForm: FollowUpFormState;
  isFollowUpOpen: boolean;
  isGeneratingFollowUp: boolean;
  followUpError: string;
  onOpenFollowUp: (message: SupabaseMessage) => void;
  onCloseFollowUp: () => void;
  onFollowUpFormChange: (field: keyof FollowUpFormState, value: string) => void;
  onGenerateFollowUp: () => void;
  onCopy: (message: SupabaseMessage) => void;
  onDelete: (id: string) => void;
}) {
  const normalizedSearch = search.trim().toLowerCase();
  const initialMessages = messages.filter((message) => message.type !== "follow_up");
  const followUpsByParent = messages.reduce<Record<string, SupabaseMessage[]>>((groups, message) => {
    if (message.type !== "follow_up" || !message.parent_message_id) return groups;

    return {
      ...groups,
      [message.parent_message_id]: [...(groups[message.parent_message_id] ?? []), message].sort(
        (first, second) => (first.sequence_number ?? 1) - (second.sequence_number ?? 1),
      ),
    };
  }, {});
  const filteredMessages = initialMessages.filter((message) => {
    const leadStatus = message.leads?.status;
    const matchesStatus = statusFilter === "all" || leadStatus === statusFilter;
    const matchesCampaign =
      campaignFilter === "all" || message.campaign_id === campaignFilter;
    const searchableText = [
      message.content,
      message.leads?.name,
      message.leads?.company,
      message.campaigns?.target,
      message.campaigns?.offer,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return (
      matchesStatus &&
      matchesCampaign &&
      (!normalizedSearch || searchableText.includes(normalizedSearch))
    );
  });
  const visibleMessagesForExport = filteredMessages.flatMap((message) => [
    message,
    ...(followUpsByParent[message.id] ?? []),
  ]);

  function exportVisibleMessages() {
    if (visibleMessagesForExport.length === 0) return;

    downloadCsv(
      "leadflow_messages_export.csv",
      visibleMessagesForExport.map((message) => ({
        lead_name: message.leads?.name ?? "",
        lead_company: message.leads?.company ?? "",
        lead_role: message.leads?.role ?? "",
        lead_email: message.leads?.email ?? "",
        lead_website: message.leads?.website ?? "",
        message_content: message.content,
        message_type: message.type ?? "initial",
        campaign_name: message.campaigns?.name ?? "",
        campaign_target: message.campaigns?.target ?? "",
        campaign_offer: message.campaigns?.offer ?? "",
        campaign_tone: message.campaigns?.tone ?? "",
        campaign_channel: message.campaigns?.channel ?? "",
        created_at: message.created_at,
      })),
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-sky-600">
            Messages
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 dark:text-slate-100">
            Saved messages
          </h1>
        </div>
        <button
          type="button"
          onClick={exportVisibleMessages}
          disabled={visibleMessagesForExport.length === 0}
          className="w-fit rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 dark:hover:bg-slate-800 hover:text-slate-950 dark:hover:text-slate-100 disabled:translate-y-0 disabled:cursor-not-allowed disabled:text-slate-300"
        >
          Export CSV
        </button>
      </div>

      <section className="rounded-3xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)] sm:p-6">
        <div className="mb-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_260px]">
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search messages, leads, companies..."
            className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 px-4 py-3 text-sm text-slate-900 dark:text-slate-100 outline-none transition placeholder:text-slate-400 dark:placeholder:text-slate-500 hover:bg-white dark:hover:bg-slate-950 focus:border-sky-400 focus:bg-white dark:focus:bg-slate-950 focus:ring-4 focus:ring-sky-100"
          />
          <select
            value={statusFilter}
            onChange={(event) =>
              onStatusFilterChange(event.target.value as "all" | LeadStatus)
            }
            className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 px-4 py-3 text-sm text-slate-900 dark:text-slate-100 outline-none transition hover:bg-white dark:hover:bg-slate-950 focus:border-sky-400 focus:bg-white dark:focus:bg-slate-950 focus:ring-4 focus:ring-sky-100"
          >
            <option value="all">all</option>
            {leadStatuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <select
            value={campaignFilter}
            onChange={(event) => onCampaignFilterChange(event.target.value)}
            className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 px-4 py-3 text-sm text-slate-900 dark:text-slate-100 outline-none transition hover:bg-white dark:hover:bg-slate-950 focus:border-sky-400 focus:bg-white dark:focus:bg-slate-950 focus:ring-4 focus:ring-sky-100"
          >
            <option value="all">All campaigns</option>
            {campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name} / {campaign.target} / {campaign.offer}
              </option>
            ))}
          </select>
        </div>

        {error ? (
          <div className="mb-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {isLoading ? (
          <div className="py-12 text-center text-sm font-medium text-slate-500 dark:text-slate-400">
            Loading messages...
          </div>
        ) : messages.length === 0 ? (
          <div className="py-12 text-center text-sm font-medium text-slate-500 dark:text-slate-400">
            No saved messages yet. Generate and save your first message from the dashboard.
          </div>
        ) : filteredMessages.length === 0 ? (
          <div className="py-12 text-center text-sm font-medium text-slate-500 dark:text-slate-400">
            No messages match your filters.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredMessages.map((message) => {
              const followUps = followUpsByParent[message.id] ?? [];

              return (
              <article
                key={message.id}
                className="rounded-3xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900 p-4 shadow-[0_14px_42px_rgba(15,23,42,0.05)] transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_20px_60px_rgba(15,23,42,0.08)]"
              >
                <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-semibold text-slate-950 dark:text-slate-100">
                        {message.leads?.name ?? "No linked lead"}
                      </h2>
                      {message.leads && message.lead_id ? (
                        <select
                          value={message.leads.status}
                          onChange={(event) =>
                            onLeadStatusChange(
                              message.lead_id as string,
                              event.target.value as LeadStatus,
                            )
                          }
                          className={`rounded-2xl border px-2.5 py-1 text-xs font-semibold outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100 ${statusBadgeStyles[message.leads.status]} dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-400 dark:focus:ring-blue-500/30`}
                        >
                          {leadStatuses.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      {message.leads
                        ? `${message.leads.role} at ${message.leads.company}`
                        : "Saved without a lead"}
                    </p>
                  </div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">{formatDate(message.created_at)}</div>
                </div>

                <p className="whitespace-pre-wrap rounded-3xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 p-4 text-sm leading-6 text-slate-800 dark:text-slate-200">
                  {message.content}
                </p>

                <div className="mt-3 flex flex-col gap-3 border-t border-slate-100 dark:border-slate-800 pt-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-slate-500 dark:text-slate-400">
                    {message.campaigns
                      ? `${message.campaigns.channel} · ${message.campaigns.target} · ${message.campaigns.offer}`
                      : "No linked campaign"}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {message.leads && message.lead_id ? (
                      <button
	                        type="button"
	                        onClick={() => onOpenLead(message)}
	                        className="rounded-2xl border border-sky-100 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 transition hover:-translate-y-0.5 hover:border-sky-200 hover:bg-sky-100"
                      >
	                        Open lead
	                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => onOpenFollowUp(message)}
                      className="rounded-2xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 transition hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-100"
                    >
                      Generate follow-up
                    </button>
                    {message.leads ? (
                      <button
                        type="button"
                        onClick={() => onSendEmail(message)}
                        disabled={!message.leads.email}
                        title={message.leads.email ? "Open email draft" : "No email"}
                        className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:-translate-y-0.5 hover:border-emerald-200 hover:bg-emerald-100 disabled:translate-y-0 disabled:cursor-not-allowed disabled:border-slate-100 disabled:bg-slate-50 disabled:text-slate-400"
                      >
                        {message.leads.email ? "Send Email" : "No email"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => onCopy(message)}
                      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 dark:hover:bg-slate-800 hover:text-slate-950 dark:hover:text-slate-100"
                    >
                      {copiedMessageId === message.id ? "Copied" : "Copy"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(message.id)}
                      className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition hover:-translate-y-0.5 hover:border-red-300 hover:bg-red-100 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {followUps.length > 0 ? (
                  <div className="mt-4 space-y-3 border-l-2 border-slate-200 dark:border-slate-800 pl-4">
                    {followUps.map((followUp, index) => (
                      <div
                        key={followUp.id}
                        className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 p-4"
                      >
                        <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                            Follow-up {index + 1}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {formatDate(followUp.created_at)}
                          </div>
                        </div>
                        <p className="whitespace-pre-wrap text-sm leading-6 text-slate-800 dark:text-slate-200">
                          {followUp.content}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {followUp.leads ? (
                            <button
                              type="button"
                              onClick={() => onSendEmail(followUp)}
                              disabled={!followUp.leads.email}
                              title={followUp.leads.email ? "Open email draft" : "No email"}
                              className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:-translate-y-0.5 hover:border-emerald-200 hover:bg-emerald-100 disabled:translate-y-0 disabled:cursor-not-allowed disabled:border-slate-100 disabled:bg-slate-50 disabled:text-slate-400"
                            >
                              {followUp.leads.email ? "Send Email" : "No email"}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => onCopy(followUp)}
                            className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 dark:hover:bg-slate-800 hover:text-slate-950 dark:hover:text-slate-100"
                          >
                            {copiedMessageId === followUp.id ? "Copied" : "Copy"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </article>
            );
            })}
          </div>
        )}
      </section>

      {isFollowUpOpen && followUpMessage ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/30 px-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl shadow-slate-950/10 dark:shadow-black/40">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-slate-950 dark:text-slate-100">
                  Generate follow-up
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Create a short follow-up connected to the original message.
                </p>
              </div>
              <button
                type="button"
                onClick={onCloseFollowUp}
                disabled={isGeneratingFollowUp}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-800 dark:hover:bg-slate-800 hover:text-slate-950 dark:hover:text-slate-100 disabled:cursor-not-allowed disabled:text-slate-300"
              >
                Close
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <label className="space-y-2">
                <FieldLabel>Follow-up type</FieldLabel>
                <select
                  value={followUpForm.followUpType}
                  onChange={(event) => onFollowUpFormChange("followUpType", event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 px-4 py-3 text-sm text-slate-900 dark:text-slate-100 outline-none transition hover:bg-white dark:hover:bg-slate-950 focus:border-sky-400 focus:bg-white dark:focus:bg-slate-950 focus:ring-4 focus:ring-sky-100"
                >
                  {followUpTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <FieldLabel>Tone</FieldLabel>
                <select
                  value={followUpForm.tone}
                  onChange={(event) => onFollowUpFormChange("tone", event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 px-4 py-3 text-sm text-slate-900 dark:text-slate-100 outline-none transition hover:bg-white dark:hover:bg-slate-950 focus:border-sky-400 focus:bg-white dark:focus:bg-slate-950 focus:ring-4 focus:ring-sky-100"
                >
                  <option value="friendly">friendly</option>
                  <option value="professional">professional</option>
                  <option value="direct">direct</option>
                </select>
              </label>

              <label className="space-y-2">
                <FieldLabel>Language</FieldLabel>
                <select
                  value={followUpForm.language}
                  onChange={(event) => onFollowUpFormChange("language", event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 px-4 py-3 text-sm text-slate-900 dark:text-slate-100 outline-none transition hover:bg-white dark:hover:bg-slate-950 focus:border-sky-400 focus:bg-white dark:focus:bg-slate-950 focus:ring-4 focus:ring-sky-100"
                >
                  {languages.map((languageOption) => (
                    <option key={languageOption.value} value={languageOption.value}>
                      {languageOption.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4 rounded-3xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 p-4 text-sm leading-6 text-slate-700 dark:text-slate-200">
              {followUpMessage.content}
            </div>

            {followUpError ? (
              <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                {followUpError}
              </div>
            ) : null}

            <button
              type="button"
              onClick={onGenerateFollowUp}
              disabled={isGeneratingFollowUp}
              className="mt-6 w-full rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:-translate-y-0.5 hover:bg-blue-700 disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
            >
              {isGeneratingFollowUp ? "Generating..." : "Generate Follow-up"}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function CampaignsPage({
  campaigns,
  isLoading,
  error,
  search,
  form,
  isFormOpen,
  isSubmitting,
  editingCampaign,
  onSearchChange,
  onOpenCreate,
  onOpenEdit,
  onCloseForm,
  onFormChange,
  onSubmit,
  onDelete,
  onUseCampaign,
}: {
  campaigns: SupabaseCampaign[];
  isLoading: boolean;
  error: string;
  search: string;
  form: CampaignFormState;
  isFormOpen: boolean;
  isSubmitting: boolean;
  editingCampaign: SupabaseCampaign | null;
  onSearchChange: (value: string) => void;
  onOpenCreate: () => void;
  onOpenEdit: (campaign: SupabaseCampaign) => void;
  onCloseForm: () => void;
  onFormChange: (field: keyof CampaignFormState, value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onDelete: (id: string) => void;
  onUseCampaign: (campaign: SupabaseCampaign) => void;
}) {
  const normalizedSearch = search.trim().toLowerCase();
  const filteredCampaigns = campaigns.filter((campaign) => {
    const searchableText = [campaign.name, campaign.target, campaign.offer]
      .join(" ")
      .toLowerCase();

    return !normalizedSearch || searchableText.includes(normalizedSearch);
  });

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-sky-600">
            Campaigns
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 dark:text-slate-100">
            Campaign database
          </h1>
        </div>
        <button
          type="button"
          onClick={onOpenCreate}
          className="w-fit rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-slate-300/70 dark:shadow-black/30 transition hover:-translate-y-0.5 hover:bg-slate-800"
        >
          Create Campaign
        </button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <section className="rounded-3xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)] sm:p-6">
        <div className="mb-5">
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search campaigns by name, target, or offer..."
            className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 px-4 py-3 text-sm text-slate-900 dark:text-slate-100 outline-none transition placeholder:text-slate-400 dark:placeholder:text-slate-500 hover:bg-white dark:hover:bg-slate-950 focus:border-sky-400 focus:bg-white dark:focus:bg-slate-950 focus:ring-4 focus:ring-sky-100"
          />
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-sm font-medium text-slate-500 dark:text-slate-400">
            Loading campaigns...
          </div>
        ) : campaigns.length === 0 ? (
          <div className="py-12 text-center text-sm font-medium text-slate-500 dark:text-slate-400">
            No campaigns yet. Create your first campaign to start generating messages.
          </div>
        ) : filteredCampaigns.length === 0 ? (
          <div className="py-12 text-center text-sm font-medium text-slate-500 dark:text-slate-400">
            No campaigns match your search.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] border-separate border-spacing-0 text-left text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-500 dark:bg-slate-950/40 dark:text-slate-400">
                  {[
                    "Name",
                    "Target",
                    "Offer",
                    "Tone",
                    "Channel",
                    "Created At",
                    "Messages",
                    "Leads",
                    "Actions",
                  ].map((heading) => (
                    <th key={heading} className="border-y border-slate-200 dark:border-slate-800 px-4 py-3 font-semibold first:rounded-l-2xl first:border-l last:rounded-r-2xl last:border-r">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredCampaigns.map((campaign) => {
                  const messageCount = campaign.messages?.length ?? 0;
                  const leadCount = new Set(
                    (campaign.messages ?? [])
                      .map((message) => message.lead_id)
                      .filter(Boolean),
                  ).size;

                  return (
                    <tr key={campaign.id} className="group">
                      <td className="border-b border-slate-100 bg-transparent px-4 py-4 font-medium text-slate-950 transition group-hover:bg-slate-50 dark:border-slate-800/70 dark:bg-transparent dark:text-slate-100 dark:group-hover:bg-white/5 dark:group-hover:text-slate-100">
                        {campaign.name}
                      </td>
                      <td className="border-b border-slate-100 bg-transparent px-4 py-4 text-slate-700 transition group-hover:bg-slate-50 dark:border-slate-800/70 dark:bg-transparent dark:text-slate-300 dark:group-hover:bg-white/5 dark:group-hover:text-slate-100">
                        {campaign.target}
                      </td>
                      <td className="border-b border-slate-100 bg-transparent px-4 py-4 text-slate-700 transition group-hover:bg-slate-50 dark:border-slate-800/70 dark:bg-transparent dark:text-slate-300 dark:group-hover:bg-white/5 dark:group-hover:text-slate-100">
                        {campaign.offer}
                      </td>
                      <td className="border-b border-slate-100 bg-transparent px-4 py-4 text-slate-600 transition group-hover:bg-slate-50 dark:border-slate-800/70 dark:bg-transparent dark:text-slate-400 dark:group-hover:bg-white/5 dark:group-hover:text-slate-100">
                        {campaign.tone}
                      </td>
                      <td className="border-b border-slate-100 bg-transparent px-4 py-4 text-slate-600 transition group-hover:bg-slate-50 dark:border-slate-800/70 dark:bg-transparent dark:text-slate-400 dark:group-hover:bg-white/5 dark:group-hover:text-slate-100">
                        {campaign.channel}
                      </td>
                      <td className="border-b border-slate-100 bg-transparent px-4 py-4 text-slate-600 transition group-hover:bg-slate-50 dark:border-slate-800/70 dark:bg-transparent dark:text-slate-400 dark:group-hover:bg-white/5 dark:group-hover:text-slate-100">
                        {formatDate(campaign.created_at)}
                      </td>
                      <td className="border-b border-slate-100 bg-transparent px-4 py-4 text-slate-700 transition group-hover:bg-slate-50 dark:border-slate-800/70 dark:bg-transparent dark:text-slate-300 dark:group-hover:bg-white/5 dark:group-hover:text-slate-100">
                        {messageCount}
                      </td>
                      <td className="border-b border-slate-100 bg-transparent px-4 py-4 text-slate-700 transition group-hover:bg-slate-50 dark:border-slate-800/70 dark:bg-transparent dark:text-slate-300 dark:group-hover:bg-white/5 dark:group-hover:text-slate-100">
                        {leadCount}
                      </td>
                      <td className="border-b border-slate-100 bg-transparent px-4 py-4 transition group-hover:bg-slate-50 dark:border-slate-800/70 dark:bg-transparent dark:group-hover:bg-white/5 dark:group-hover:text-slate-100">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => onUseCampaign(campaign)}
                            className="rounded-2xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-slate-300/60 dark:shadow-black/30 transition hover:-translate-y-0.5 hover:bg-blue-700"
                          >
                            Use campaign
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenEdit(campaign)}
                            className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 dark:hover:bg-slate-800 hover:text-slate-950 dark:hover:text-slate-100"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(campaign.id)}
                            className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition hover:-translate-y-0.5 hover:border-red-300 hover:bg-red-100 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isFormOpen ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/30 px-4 backdrop-blur-sm">
          <form
            onSubmit={onSubmit}
            className="w-full max-w-xl rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl shadow-slate-950/10 dark:shadow-black/40"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-slate-950 dark:text-slate-100">
                  {editingCampaign ? "Edit Campaign" : "Create Campaign"}
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Save reusable campaign context for generation.
                </p>
              </div>
              <button
                type="button"
                onClick={onCloseForm}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-800 dark:hover:bg-slate-800 hover:text-slate-950 dark:hover:text-slate-100"
              >
                Close
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 sm:col-span-2">
                <FieldLabel>Name</FieldLabel>
                <input
                  value={form.name}
                  onChange={(event) => onFormChange("name", event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 px-4 py-3 text-sm outline-none transition hover:bg-white dark:hover:bg-slate-950 focus:border-sky-400 focus:bg-white dark:focus:bg-slate-950 focus:ring-4 focus:ring-sky-100"
                />
              </label>
              <label className="space-y-2">
                <FieldLabel>Target</FieldLabel>
                <input
                  value={form.target}
                  onChange={(event) => onFormChange("target", event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 px-4 py-3 text-sm outline-none transition hover:bg-white dark:hover:bg-slate-950 focus:border-sky-400 focus:bg-white dark:focus:bg-slate-950 focus:ring-4 focus:ring-sky-100"
                />
              </label>
              <label className="space-y-2">
                <FieldLabel>Offer</FieldLabel>
                <input
                  value={form.offer}
                  onChange={(event) => onFormChange("offer", event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 px-4 py-3 text-sm outline-none transition hover:bg-white dark:hover:bg-slate-950 focus:border-sky-400 focus:bg-white dark:focus:bg-slate-950 focus:ring-4 focus:ring-sky-100"
                />
              </label>
              <label className="space-y-2">
                <FieldLabel>Tone</FieldLabel>
                <select
                  value={form.tone}
                  onChange={(event) => onFormChange("tone", event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 px-4 py-3 text-sm outline-none transition hover:bg-white dark:hover:bg-slate-950 focus:border-sky-400 focus:bg-white dark:focus:bg-slate-950 focus:ring-4 focus:ring-sky-100"
                >
                  <option value="friendly">friendly</option>
                  <option value="professional">professional</option>
                  <option value="direct">direct</option>
                </select>
              </label>
              <label className="space-y-2">
                <FieldLabel>Channel</FieldLabel>
                <select
                  value={form.channel}
                  onChange={(event) => onFormChange("channel", event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 px-4 py-3 text-sm outline-none transition hover:bg-white dark:hover:bg-slate-950 focus:border-sky-400 focus:bg-white dark:focus:bg-slate-950 focus:ring-4 focus:ring-sky-100"
                >
                  {channels.map((channelOption) => (
                    <option key={channelOption} value={channelOption}>
                      {channelOption}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-6 w-full rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:-translate-y-0.5 hover:bg-blue-700 disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
            >
              {isSubmitting ? "Saving..." : editingCampaign ? "Update Campaign" : "Create Campaign"}
            </button>
          </form>
        </div>
      ) : null}
    </section>
  );
}

function SettingsPage({
  settings,
  onToggle,
  onDefaultToneChange,
  onDefaultChannelChange,
  onDefaultLanguageChange,
  onThemeChange,
  onReset,
}: {
  settings: AppSettings;
  onToggle: (key: "autoSave" | "confirmDelete" | "compactMode", value: boolean) => void;
  onDefaultToneChange: (value: ApiTone) => void;
  onDefaultChannelChange: (value: Channel) => void;
  onDefaultLanguageChange: (value: Language) => void;
  onThemeChange: (value: ThemeSetting) => void;
  onReset: () => void;
}) {
  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-sky-600">
            Settings
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 dark:text-slate-100">
            Workspace preferences
          </h1>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="w-fit rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 dark:hover:bg-slate-800 hover:text-slate-950 dark:hover:text-slate-100"
        >
          Reset settings
        </button>
      </div>

      <section className="rounded-3xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)] sm:p-6">
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-950 dark:text-slate-100">
                Auto-save generated messages
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Save generated messages automatically after a successful response.
              </p>
            </div>
            <ToggleSwitch
              checked={settings.autoSave}
              onChange={(value) => onToggle("autoSave", value)}
            />
          </div>

          <div className="grid gap-4 py-4 sm:grid-cols-2">
            <label className="space-y-2 sm:col-span-2">
              <FieldLabel>Theme</FieldLabel>
              <select
                value={settings.theme}
                onChange={(event) => onThemeChange(event.target.value as ThemeSetting)}
                className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 px-4 py-3 text-sm text-slate-900 dark:text-slate-100 outline-none transition hover:bg-white dark:hover:bg-slate-950 focus:border-sky-400 focus:bg-white dark:focus:bg-slate-950 focus:ring-4 focus:ring-sky-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-950 dark:focus:border-sky-500 dark:focus:bg-slate-950 dark:focus:ring-sky-950"
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="system">System</option>
              </select>
            </label>

            <label className="space-y-2">
              <FieldLabel>Default tone</FieldLabel>
              <select
                value={settings.defaultTone}
                onChange={(event) => onDefaultToneChange(event.target.value as ApiTone)}
                className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 px-4 py-3 text-sm text-slate-900 dark:text-slate-100 outline-none transition hover:bg-white dark:hover:bg-slate-950 focus:border-sky-400 focus:bg-white dark:focus:bg-slate-950 focus:ring-4 focus:ring-sky-100"
              >
                <option value="friendly">friendly</option>
                <option value="professional">professional</option>
                <option value="direct">direct</option>
              </select>
            </label>

            <label className="space-y-2">
              <FieldLabel>Default channel</FieldLabel>
              <select
                value={settings.defaultChannel}
                onChange={(event) => onDefaultChannelChange(event.target.value as Channel)}
                className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 px-4 py-3 text-sm text-slate-900 dark:text-slate-100 outline-none transition hover:bg-white dark:hover:bg-slate-950 focus:border-sky-400 focus:bg-white dark:focus:bg-slate-950 focus:ring-4 focus:ring-sky-100"
              >
                {channels.map((channelOption) => (
                  <option key={channelOption} value={channelOption}>
                    {channelOption}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 sm:col-span-2">
              <FieldLabel>Default language</FieldLabel>
              <select
                value={settings.defaultLanguage}
                onChange={(event) => onDefaultLanguageChange(event.target.value as Language)}
                className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 px-4 py-3 text-sm text-slate-900 dark:text-slate-100 outline-none transition hover:bg-white dark:hover:bg-slate-950 focus:border-sky-400 focus:bg-white dark:focus:bg-slate-950 focus:ring-4 focus:ring-sky-100"
              >
                {languages.map((languageOption) => (
                  <option key={languageOption.value} value={languageOption.value}>
                    {languageOption.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-950 dark:text-slate-100">
                Confirm before deleting
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Ask before deleting leads, messages, or campaigns.
              </p>
            </div>
            <ToggleSwitch
              checked={settings.confirmDelete}
              onChange={(value) => onToggle("confirmDelete", value)}
            />
          </div>

          <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-950 dark:text-slate-100">Compact mode</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Use tighter dashboard spacing on supported views.
              </p>
            </div>
            <ToggleSwitch
              checked={settings.compactMode}
              onChange={(value) => onToggle("compactMode", value)}
            />
          </div>
        </div>
      </section>
    </section>
  );
}

function LandingPage({
  onStart,
  onLogin,
}: {
  onStart: () => void;
  onLogin: () => void;
}) {
  const features = ["Bulk message generation", "Follow-ups", "CSV import/export"];

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950 px-4 py-8 text-slate-950 dark:text-slate-100">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl flex-col">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-sm font-semibold text-white shadow-lg shadow-slate-300/70 dark:shadow-black/30">
              LF
            </div>
            <span className="text-base font-semibold tracking-tight">LeadFlow</span>
          </div>
          <button
            type="button"
            onClick={onLogin}
            className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 dark:hover:bg-slate-800 hover:text-slate-950 dark:hover:text-slate-100"
          >
            Login
          </button>
        </header>

        <div className="grid flex-1 items-center gap-10 py-16 lg:grid-cols-[minmax(0,0.9fr)_minmax(420px,1fr)]">
          <div className="max-w-3xl text-center lg:text-left">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">
              AI outreach workspace
            </p>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-slate-950 dark:text-slate-100 sm:text-6xl lg:text-7xl">
              Get more replies from cold outreach
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-slate-500 dark:text-slate-400 sm:text-lg lg:mx-0">
              Generate, follow up, and manage your outreach in one place
            </p>
            <div className="mt-8 flex justify-center lg:justify-start">
              <button
                type="button"
                onClick={onStart}
                className="rounded-2xl bg-blue-600 px-6 py-4 text-base font-semibold text-white shadow-xl shadow-blue-600/25 transition hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-2xl hover:shadow-blue-600/30 active:translate-y-0"
              >
                Start for free
              </button>
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-3 lg:max-w-2xl">
              {features.map((feature) => (
                <div
                  key={feature}
                  className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 text-sm font-semibold text-slate-700 dark:text-slate-200 shadow-[0_14px_42px_rgba(15,23,42,0.05)]"
                >
                  <div className="mb-3 h-1.5 w-8 rounded-full bg-blue-600" />
                  {feature}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-[0_28px_90px_rgba(15,23,42,0.12)]">
            <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 p-4">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">
                    Dashboard
                  </div>
                  <div className="mt-1 text-lg font-semibold text-slate-950 dark:text-slate-100">Message workflow</div>
                </div>
                <span className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  Auto-saved
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
                  <div className="text-xs font-semibold text-slate-400 dark:text-slate-500">Target</div>
                  <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">Founders at SaaS teams</div>
                </div>
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
                  <div className="text-xs font-semibold text-slate-400 dark:text-slate-500">Channel</div>
                  <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">LinkedIn DM</div>
                </div>
              </div>
              <div className="mt-3 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-950 dark:text-slate-100">Generated message</span>
                  <span className="rounded-2xl bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                    Ready
                  </span>
                </div>
                <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                  Hi there, I noticed many SaaS teams spend time testing outreach manually. LeadFlow helps draft and organize short messages faster, without losing the human tone. Open to seeing what it would write for your next campaign?
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function AppLoadingScreen({ isReady }: { isReady: boolean }) {
  return (
    <main
      className={`fixed inset-0 z-50 flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white transition-opacity duration-500 dark:bg-slate-950 ${
        isReady ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <section className="text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl border border-white/10 bg-white/10 text-2xl font-semibold shadow-2xl shadow-blue-950/50 backdrop-blur">
          LF
        </div>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight">LeadFlow</h1>
        <p className="mt-2 text-sm font-medium text-slate-400">Preparing your workspace</p>
        <div className="mx-auto mt-8 h-1.5 w-56 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-blue-500 shadow-[0_0_28px_rgba(59,130,246,0.8)]" />
        </div>
        <div className="mt-5 flex justify-center gap-2">
          <span className="h-2 w-2 animate-bounce rounded-full bg-blue-400" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-blue-400 [animation-delay:120ms]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-blue-400 [animation-delay:240ms]" />
        </div>
      </section>
    </main>
  );
}

function AuthPage({
  initialMode = "login",
  onBack,
}: {
  initialMode?: AuthMode;
  onBack: () => void;
}) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordHint, setPasswordHint] = useState("");
  const [shownPasswordHint, setShownPasswordHint] = useState("");
  const [authError, setAuthError] = useState("");
  const [authSuccess, setAuthSuccess] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setMode(initialMode);
    setAuthError("");
    setAuthSuccess("");
    setPasswordHint("");
    setShownPasswordHint("");
  }, [initialMode]);

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setAuthError("");
    setAuthSuccess("");
    setPassword("");
    setPasswordHint("");
    setShownPasswordHint("");
  }

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");
    setAuthSuccess("");
    setIsSubmitting(true);

    try {
      if (!supabase) {
        throw new Error("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      }

      const credentials = {
        email: email.trim().toLowerCase(),
        password,
      };

      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword(credentials);
        if (error) throw error;
        return;
      }

      const { data, error } = await supabase.auth.signUp(credentials);

      if (error) throw error;

      const trimmedPasswordHint = passwordHint.trim().slice(0, 120);

      if (trimmedPasswordHint) {
        const { error: hintError } = await supabase.from("password_hints").upsert(
          {
            email: credentials.email,
            hint: trimmedPasswordHint,
          },
          { onConflict: "email" },
        );

        if (hintError) throw hintError;
      }

      if (!data.session) {
        setSignupEmail(credentials.email);
        setPassword("");
        setPasswordHint("");
        setAuthSuccess(
          `Check your email to confirm your account before continuing${
            credentials.email ? `: ${credentials.email}` : "."
          }`,
        );
      }
    } catch (error) {
      setAuthError(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function showPasswordHint() {
    setAuthError("");
    setAuthSuccess("");
    setShownPasswordHint("");

    try {
      if (!supabase) {
        throw new Error("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      }

      const normalizedEmail = email.trim().toLowerCase();

      if (!normalizedEmail) {
        throw new Error("Enter your email first.");
      }

      const { data, error } = await supabase
        .from("password_hints")
        .select("hint")
        .eq("email", normalizedEmail)
        .maybeSingle();

      if (error) throw error;
      setShownPasswordHint(data?.hint ?? "No hint found for this email.");
    } catch (error) {
      setAuthError(getErrorMessage(error));
    }
  }

  const title = mode === "login" ? "Log in" : "Create account";
  const description = "Use email and password to access your sales workspace.";
  const submitLabel = mode === "login" ? "Login" : "Sign up";

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950 px-4 py-10 text-slate-950 dark:text-slate-100">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl shadow-slate-200/80 dark:shadow-black/30">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="mb-5 text-sm font-semibold text-slate-500 dark:text-slate-400 transition hover:text-slate-950 dark:hover:text-slate-100"
          >
            Back
          </button>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-600">
            LeadFlow
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 dark:text-slate-100">
            {title}
          </h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {description}
          </p>
        </div>

        <div className="mt-6 grid grid-cols-2 rounded-2xl bg-slate-100 dark:bg-slate-800 p-1 text-sm font-semibold">
          <button
            type="button"
            onClick={() => changeMode("login")}
            className={`rounded-xl px-3 py-2 transition ${
              mode === "login" ? "bg-white dark:bg-slate-900 text-slate-950 dark:text-slate-100 shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => changeMode("signup")}
            className={`rounded-xl px-3 py-2 transition ${
              mode === "signup" ? "bg-white dark:bg-slate-900 text-slate-950 dark:text-slate-100 shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            Signup
          </button>
        </div>

        <form onSubmit={handleAuth} className="mt-6 space-y-4">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="mt-2 w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 px-4 py-3 text-sm text-slate-950 dark:text-slate-100 outline-none transition placeholder:text-slate-400 dark:placeholder:text-slate-500 hover:bg-white dark:hover:bg-slate-950 focus:border-sky-400 focus:bg-white dark:focus:bg-slate-950 focus:ring-4 focus:ring-sky-100 dark:focus:ring-sky-900/40"
              placeholder="you@company.com"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={6}
              className="mt-2 w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 px-4 py-3 text-sm text-slate-950 dark:text-slate-100 outline-none transition placeholder:text-slate-400 dark:placeholder:text-slate-500 hover:bg-white dark:hover:bg-slate-950 focus:border-sky-400 focus:bg-white dark:focus:bg-slate-950 focus:ring-4 focus:ring-sky-100 dark:focus:ring-sky-900/40"
              placeholder="Minimum 6 characters"
            />
          </label>
          {mode === "signup" ? (
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
              Password hint
              <input
                type="text"
                value={passwordHint}
                onChange={(event) => setPasswordHint(event.target.value.slice(0, 120))}
                maxLength={120}
                className="mt-2 w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 px-4 py-3 text-sm text-slate-950 dark:text-slate-100 outline-none transition placeholder:text-slate-400 dark:placeholder:text-slate-500 hover:bg-white dark:hover:bg-slate-950 focus:border-sky-400 focus:bg-white dark:focus:bg-slate-950 focus:ring-4 focus:ring-sky-100 dark:focus:ring-sky-900/40"
                placeholder="e.g. my old laptop name"
              />
              <p className="mt-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                Do not write your actual password.
              </p>
              <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                This is only a hint. Never store your real password here.
              </p>
            </label>
          ) : null}

          {authError ? (
            <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
              {authError}
            </div>
          ) : null}
          {authSuccess ? (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {authSuccess}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-xl shadow-blue-600/25 transition hover:-translate-y-0.5 hover:bg-blue-700 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Please wait..." : submitLabel}
          </button>
        </form>

        {mode === "login" ? (
          <div className="mt-4 space-y-3">
            <button
              type="button"
              onClick={() => void showPasswordHint()}
              className="text-sm font-semibold text-blue-600 transition hover:text-blue-700"
            >
              Show password hint
            </button>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              This is only a hint. Never store your real password here.
            </p>
            {shownPasswordHint ? (
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 px-4 py-3 text-sm text-slate-700 dark:text-slate-200">
                {shownPasswordHint}
              </div>
            ) : null}
          </div>
        ) : null}

        {mode === "signup" && authSuccess ? (
          <button
            type="button"
            onClick={() => {
              changeMode("login");
              setEmail(signupEmail);
            }}
            className="mt-4 text-sm font-semibold text-blue-600 transition hover:text-blue-700"
          >
            Back to login
          </button>
        ) : null}

      </section>
    </main>
  );
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isThemeReady, setIsThemeReady] = useState(false);
  const [isInitialDataReady, setIsInitialDataReady] = useState(false);
  const [hasMinimumStartupElapsed, setHasMinimumStartupElapsed] = useState(false);
  const [hasStartupTimedOut, setHasStartupTimedOut] = useState(false);
  const [showAuthPage, setShowAuthPage] = useState(false);
  const [authInitialMode, setAuthInitialMode] = useState<AuthMode>("signup");
  const [settings, setSettings] = useState<AppSettings>(() => readStoredSettings());
  const [activeView, setActiveView] = useState<NavView>("Dashboard");
  const [target, setTarget] = useState("");
  const [offer, setOffer] = useState("");
  const [tone, setTone] = useState<Tone>(() => toDashboardTone(readStoredSettings().defaultTone));
  const [channel, setChannel] = useState<Channel>(() => readStoredSettings().defaultChannel);
  const [language, setLanguage] = useState<Language>(() => readStoredSettings().defaultLanguage);
  const [generatedMessage, setGeneratedMessage] = useState("");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [selectedLeadName, setSelectedLeadName] = useState("");
  const [selectedLeadCompany, setSelectedLeadCompany] = useState("");
  const [selectedLeadRole, setSelectedLeadRole] = useState("");
  const [selectedLeadWebsite, setSelectedLeadWebsite] = useState("");
  const [selectedLeadEmail, setSelectedLeadEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>("idle");
  const [savedMessageId, setSavedMessageId] = useState<string | null>(null);
  const [savedMessageContent, setSavedMessageContent] = useState("");
  const [generationError, setGenerationError] = useState("");
  const [supabaseLeads, setSupabaseLeads] = useState<SupabaseLead[]>([]);
  const [isLeadsLoading, setIsLeadsLoading] = useState(false);
  const [leadsError, setLeadsError] = useState("");
  const [isLeadFormOpen, setIsLeadFormOpen] = useState(false);
  const [isLeadSubmitting, setIsLeadSubmitting] = useState(false);
  const [leadForm, setLeadForm] = useState<LeadFormState>(emptyLeadForm);
  const [isCsvImportOpen, setIsCsvImportOpen] = useState(false);
  const [csvImportPreview, setCsvImportPreview] = useState<CsvLeadPreview | null>(null);
  const [csvImportError, setCsvImportError] = useState("");
  const [csvImportSuccess, setCsvImportSuccess] = useState("");
  const [isCsvImporting, setIsCsvImporting] = useState(false);
  const [selectedBulkLeadIds, setSelectedBulkLeadIds] = useState<string[]>([]);
  const [isBulkGenerateOpen, setIsBulkGenerateOpen] = useState(false);
  const [bulkGenerateForm, setBulkGenerateForm] = useState<BulkGenerateFormState>({
    offer: "",
    tone: settings.defaultTone,
    channel: settings.defaultChannel,
    language: settings.defaultLanguage,
  });
  const [isBulkGenerating, setIsBulkGenerating] = useState(false);
  const [bulkGenerateProgress, setBulkGenerateProgress] = useState<BulkGenerateProgress>({
    total: 0,
    completed: 0,
    success: 0,
    failed: 0,
  });
  const [bulkGenerateError, setBulkGenerateError] = useState("");
  const [bulkGenerateSuccess, setBulkGenerateSuccess] = useState("");
  const [messages, setMessages] = useState<SupabaseMessage[]>([]);
  const [isMessagesLoading, setIsMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState("");
  const [messageSearch, setMessageSearch] = useState("");
  const [messageStatusFilter, setMessageStatusFilter] = useState<"all" | LeadStatus>("all");
  const [messageCampaignFilter, setMessageCampaignFilter] = useState("all");
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [followUpMessage, setFollowUpMessage] = useState<SupabaseMessage | null>(null);
  const [followUpForm, setFollowUpForm] = useState<FollowUpFormState>({
    followUpType: "polite reminder",
    tone: settings.defaultTone,
    language: settings.defaultLanguage,
  });
  const [isFollowUpOpen, setIsFollowUpOpen] = useState(false);
  const [isGeneratingFollowUp, setIsGeneratingFollowUp] = useState(false);
  const [followUpError, setFollowUpError] = useState("");
  const [highlightedLeadId, setHighlightedLeadId] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<SupabaseCampaign[]>([]);
  const [isCampaignsLoading, setIsCampaignsLoading] = useState(false);
  const [campaignsError, setCampaignsError] = useState("");
  const [campaignSearch, setCampaignSearch] = useState("");
  const [isCampaignFormOpen, setIsCampaignFormOpen] = useState(false);
  const [isCampaignSubmitting, setIsCampaignSubmitting] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<SupabaseCampaign | null>(null);
  const [campaignForm, setCampaignForm] = useState<CampaignFormState>(emptyCampaignForm);

  const selectedLead: SelectedLead | null = selectedLeadId
    ? {
        id: selectedLeadId,
        name: selectedLeadName,
        company: selectedLeadCompany,
        role: selectedLeadRole,
        website: selectedLeadWebsite,
        email: selectedLeadEmail,
      }
    : null;
  const hasGeneratedMessage =
    Boolean(generatedMessage) && !generatedMessage.startsWith("Sorry,");
  const currentMessageIsSaved =
    Boolean(savedMessageId) && Boolean(generatedMessage) && savedMessageContent === generatedMessage;
  const contactedLeadCount = supabaseLeads.filter((lead) =>
    ["contacted", "replied", "interested"].includes(lead.status),
  ).length;
  const repliedLeadCount = supabaseLeads.filter((lead) => lead.status === "replied").length;
  const interestedLeadCount = supabaseLeads.filter((lead) => lead.status === "interested").length;
  const replyRate = contactedLeadCount === 0 ? 0 : (repliedLeadCount / contactedLeadCount) * 100;
  const dashboardStats = {
    totalLeads: isLeadsLoading ? "0" : String(supabaseLeads.length),
    contacted: isLeadsLoading ? "0" : String(contactedLeadCount),
    replied: isLeadsLoading ? "0" : String(repliedLeadCount),
    interested: isLeadsLoading ? "0" : String(interestedLeadCount),
    replyRate: isLeadsLoading ? "0%" : `${Math.round(replyRate)}%`,
  };
  const generationRequestIdRef = useRef(0);

  function requireCurrentUser() {
    if (!currentUser) throw new Error("You must be logged in.");
    return currentUser;
  }

  function clearWorkspaceData() {
    setSupabaseLeads([]);
    setMessages([]);
    setCampaigns([]);
    setSelectedBulkLeadIds([]);
    setSelectedLeadId(null);
    setSelectedLeadName("");
    setSelectedLeadCompany("");
    setSelectedLeadRole("");
    setSelectedLeadWebsite("");
    setSelectedLeadEmail("");
    setGeneratedMessage("");
    setSavedMessageId(null);
    setSavedMessageContent("");
    setAutoSaveStatus("idle");
  }

  async function logout() {
    if (!supabase) return;
    await supabase.auth.signOut();
    clearWorkspaceData();
    setActiveView("Dashboard");
  }

  useEffect(() => {
    const minimumTimeoutId = window.setTimeout(() => {
      setHasMinimumStartupElapsed(true);
    }, 5000);
    const safetyTimeoutId = window.setTimeout(() => {
      setHasStartupTimedOut(true);
    }, 7000);

    return () => {
      window.clearTimeout(minimumTimeoutId);
      window.clearTimeout(safetyTimeoutId);
    };
  }, []);

  useEffect(() => {
    if (!isAuthLoading && !currentUser) {
      setIsInitialDataReady(true);
    }
  }, [currentUser, isAuthLoading]);

  useEffect(() => {
    if (!supabase) {
      setIsAuthLoading(false);
      return;
    }

    let isMounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!isMounted) return;
      setCurrentUser(data.user ?? null);
      setIsAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUser(session?.user ?? null);
      setIsAuthLoading(false);
      if (!session?.user) clearWorkspaceData();
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    applyTheme(settings.theme);
    setIsThemeReady(true);

    if (settings.theme !== "system") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSystemThemeChange = () => applyTheme("system");

    mediaQuery.addEventListener("change", handleSystemThemeChange);

    return () => {
      mediaQuery.removeEventListener("change", handleSystemThemeChange);
    };
  }, [settings.theme]);

  async function fetchLeads() {
    setIsLeadsLoading(true);
    setLeadsError("");

    try {
      if (!supabase) {
        throw new Error("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      }

      const user = requireCurrentUser();
      const { data, error } = await supabase
        .from("leads")
        .select("id,name,company,role,website,email,status,user_id,created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setSupabaseLeads((data ?? []) as SupabaseLead[]);
    } catch (error) {
      setLeadsError(getErrorMessage(error));
    } finally {
      setIsLeadsLoading(false);
    }
  }

  useEffect(() => {
    if (!currentUser) return;

    setIsInitialDataReady(false);

    Promise.allSettled([fetchLeads(), fetchMessages(), fetchCampaigns()]).finally(() => {
      setIsInitialDataReady(true);
    });
  }, [currentUser?.id]);

  async function fetchMessages() {
    setIsMessagesLoading(true);
    setMessagesError("");

    try {
      if (!supabase) {
        throw new Error("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      }

      const user = requireCurrentUser();
      const { data, error } = await supabase
        .from("messages")
        .select(
          `
	          id,
	          content,
	          created_at,
	          lead_id,
	          campaign_id,
	          user_id,
	          type,
	          parent_message_id,
	          sequence_number,
	          leads (
            name,
            company,
            role,
            website,
            email,
            status
          ),
	          campaigns (
	            name,
	            target,
	            offer,
	            tone,
            channel
          )
        `,
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setMessages((data ?? []) as unknown as SupabaseMessage[]);
    } catch (error) {
      setMessagesError(getErrorMessage(error));
    } finally {
      setIsMessagesLoading(false);
    }
  }

  useEffect(() => {
    if (currentUser && activeView === "Messages") {
      void fetchMessages();
    }
  }, [activeView, currentUser?.id]);

  async function fetchCampaigns() {
    setIsCampaignsLoading(true);
    setCampaignsError("");

    try {
      if (!supabase) {
        throw new Error("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      }

      const user = requireCurrentUser();
      const { data, error } = await supabase
        .from("campaigns")
        .select(
          `
          id,
          name,
          target,
          offer,
          tone,
          channel,
          user_id,
          created_at,
          messages (
            id,
            lead_id
          )
        `,
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setCampaigns((data ?? []) as unknown as SupabaseCampaign[]);
    } catch (error) {
      setCampaignsError(getErrorMessage(error));
    } finally {
      setIsCampaignsLoading(false);
    }
  }

  useEffect(() => {
    if (currentUser && activeView === "Campaigns") {
      void fetchCampaigns();
    }
  }, [activeView, currentUser?.id]);

  async function ensureLeadExists(lead: SelectedLead | null): Promise<string | null> {
    if (!lead) return null;

    if (!supabase) {
      throw new Error("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
    }

    const user = requireCurrentUser();
    const { data: existingLead, error: findLeadError } = await supabase
      .from("leads")
      .select("id")
      .eq("id", lead.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (findLeadError) throw findLeadError;
    if (existingLead?.id) return existingLead.id;

    const { data: insertedLead, error: insertLeadError } = await supabase
      .from("leads")
      .insert({
        id: lead.id,
        name: lead.name,
        company: lead.company,
        role: lead.role,
        website: lead.website,
        email: lead.email ?? "",
        status: "new",
        user_id: user.id,
      })
      .select("id")
      .single();

    if (insertLeadError) throw insertLeadError;
    return insertedLead.id;
  }

  async function markLeadContactedIfNew(leadId: string | null) {
    if (!leadId) return;

    if (!supabase) {
      throw new Error("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
    }

    const user = requireCurrentUser();
    const { data: lead, error: findLeadError } = await supabase
      .from("leads")
      .select("status")
      .eq("id", leadId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (findLeadError) throw findLeadError;
    if (!lead?.status) return;
    if (lead.status !== "new") {
      await fetchLeads();
      return;
    }

    const { error: updateLeadError } = await supabase
      .from("leads")
      .update({ status: "contacted" })
      .eq("id", leadId)
      .eq("user_id", user.id)
      .eq("status", "new");

    if (updateLeadError) throw updateLeadError;
    await fetchLeads();
  }

  async function saveGeneratedMessage({
    content,
    target: savedTarget,
    offer: savedOffer,
    tone: savedTone,
    channel: savedChannel,
    campaignId: savedCampaignId = null,
    type: messageType = "initial",
    parentMessageId = null,
    sequenceNumber = 1,
  }: SaveGeneratedMessageInput, leadToSave: SelectedLead | null = selectedLead): Promise<string> {
    setIsSaving(true);
    setSaveError("");

    try {
      if (!supabase) {
        throw new Error("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      }

      const user = requireCurrentUser();
      const messageLeadId = await ensureLeadExists(leadToSave);
      const campaignName = `${savedChannel} campaign - ${savedTarget}`.slice(0, 120);
      let campaignId = savedCampaignId ?? undefined;

      if (!campaignId) {
        const { data: existingCampaigns, error: findCampaignError } = await supabase
          .from("campaigns")
          .select("id")
          .eq("target", savedTarget)
          .eq("offer", savedOffer)
          .eq("tone", savedTone)
          .eq("channel", savedChannel)
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1);

        if (findCampaignError) throw findCampaignError;

        campaignId = existingCampaigns?.[0]?.id;
      }

      if (!campaignId) {
        const { data: campaign, error: campaignError } = await supabase
          .from("campaigns")
          .insert({
            name: campaignName,
            target: savedTarget,
            offer: savedOffer,
            tone: savedTone,
            channel: savedChannel,
            user_id: user.id,
          })
          .select("id")
          .single();

        if (campaignError) throw campaignError;
        if (!campaign?.id) throw new Error("Campaign was created without an id.");
        campaignId = campaign.id;
      }

      const { data: message, error: messageError } = await supabase
        .from("messages")
        .insert({
          content,
          campaign_id: campaignId,
          lead_id: messageLeadId,
          user_id: user.id,
          type: messageType,
          parent_message_id: parentMessageId,
          sequence_number: sequenceNumber,
        })
        .select("id")
        .single();

      if (messageError) throw messageError;
      if (!message?.id) throw new Error("Message was saved without an id.");

      await Promise.all([
        markLeadContactedIfNew(messageLeadId).catch((error) => {
          console.error("Failed to update lead status after message save:", error);
          setLeadsError(getErrorMessage(error));
        }),
        fetchMessages(),
        fetchCampaigns(),
      ]);

      return message.id;
    } catch (error) {
      console.error("Failed to save message to Supabase:", error);
      setSaveError(getErrorMessage(error));
      throw error;
    } finally {
      setIsSaving(false);
    }
  }

  async function handleGenerateMessage(
    targetValue: string = target,
    offerValue: string = offer,
    toneValue: Tone = tone,
    channelValue: Channel = channel,
    languageValue: Language = language,
    leadValue: SelectedLead | null = selectedLead,
  ) {
    const safeTarget = String(targetValue ?? "").trim();
    const safeOffer = String(offerValue ?? "").trim();
    const safeTone = toneApiValues[toneValue] ?? toneApiValues.Friendly;
    const requestId = generationRequestIdRef.current + 1;

    generationRequestIdRef.current = requestId;

    if (!safeTarget || !safeOffer) return;

    setIsLoading(true);
    setSaveError("");
    setGenerationError("");
    setAutoSaveStatus("idle");
    setSavedMessageId(null);
    setSavedMessageContent("");

    try {
      const res = await fetch(`${API_URL}/api/generate-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: safeTarget,
          offer: safeOffer,
          tone: safeTone,
          channel: channelValue,
          language: languageValue,
        }),
      });

      if (!res.ok) throw new Error(`Request failed with status ${res.status}`);

      const data = (await res.json()) as GenerateMessageResponse;

      if (generationRequestIdRef.current !== requestId) return;

      setGeneratedMessage(data.message);

      if (!settings.autoSave) {
        setAutoSaveStatus("idle");
        return;
      }

      setAutoSaveStatus("saving");

      try {
        const messageId = await saveGeneratedMessage({
          content: data.message,
          target: safeTarget,
          offer: safeOffer,
          tone: safeTone,
          channel: channelValue,
        }, leadValue);

        if (generationRequestIdRef.current !== requestId) return;

        setSavedMessageId(messageId);
        setSavedMessageContent(data.message);
        setAutoSaveStatus("saved");
      } catch {
        if (generationRequestIdRef.current === requestId) {
          setAutoSaveStatus("failed");
        }
      }
    } catch (error) {
      console.error("Failed to generate message:", error);
      setGenerationError(getErrorMessage(error));
      setGeneratedMessage("Sorry, something went wrong. Please try again.");
      setAutoSaveStatus("idle");
    } finally {
      if (generationRequestIdRef.current === requestId) {
        setIsLoading(false);
      }
    }
  }

  async function copyMessage() {
    if (!generatedMessage) return;
    await navigator.clipboard?.writeText(generatedMessage);
  }

  function saveMessage() {
    if (!generatedMessage || !target.trim() || !offer.trim() || currentMessageIsSaved) return;

    void saveGeneratedMessage({
      content: generatedMessage,
      target: target.trim(),
      offer: offer.trim(),
      tone: toneApiValues[tone],
      channel,
    })
      .then((messageId) => {
        setSavedMessageId(messageId);
        setSavedMessageContent(generatedMessage);
        setAutoSaveStatus("saved");
      })
      .catch(() => {
        setAutoSaveStatus("failed");
      });
  }

  function selectLead(lead: SupabaseLead) {
    const nextSelectedLead = toSelectedLead(lead);

    setSelectedLeadId(nextSelectedLead.id);
    setSelectedLeadName(nextSelectedLead.name);
    setSelectedLeadCompany(nextSelectedLead.company);
    setSelectedLeadRole(nextSelectedLead.role);
    setSelectedLeadWebsite(nextSelectedLead.website);
    setSelectedLeadEmail(nextSelectedLead.email ?? "");
    setTarget(getLeadTarget(lead));
  }

  function generateForLead(lead: SupabaseLead) {
    const nextSelectedLead = toSelectedLead(lead);
    const leadTarget = getLeadTarget(lead);

    setSelectedLeadId(nextSelectedLead.id);
    setSelectedLeadName(nextSelectedLead.name);
    setSelectedLeadCompany(nextSelectedLead.company);
    setSelectedLeadRole(nextSelectedLead.role);
    setSelectedLeadWebsite(nextSelectedLead.website);
    setSelectedLeadEmail(nextSelectedLead.email ?? "");
    setTarget(leadTarget);
    void handleGenerateMessage(leadTarget, offer, tone, channel, language, nextSelectedLead);
  }

  function toggleLeadSelection(leadId: string) {
    setSelectedBulkLeadIds((current) =>
      current.includes(leadId)
        ? current.filter((id) => id !== leadId)
        : [...current, leadId],
    );
  }

  function toggleAllVisibleLeads() {
    const visibleLeadIds = supabaseLeads.map((lead) => lead.id);
    const allVisibleSelected =
      visibleLeadIds.length > 0 && visibleLeadIds.every((id) => selectedBulkLeadIds.includes(id));

    setSelectedBulkLeadIds((current) => {
      if (allVisibleSelected) {
        return current.filter((id) => !visibleLeadIds.includes(id));
      }

      return Array.from(new Set([...current, ...visibleLeadIds]));
    });
  }

  function openBulkGenerate() {
    setBulkGenerateForm({
      offer,
      tone: toneApiValues[tone] ?? settings.defaultTone,
      channel,
      language: settings.defaultLanguage,
    });
    setBulkGenerateError("");
    setBulkGenerateSuccess("");
    setBulkGenerateProgress({ total: 0, completed: 0, success: 0, failed: 0 });
    setIsBulkGenerateOpen(true);
  }

  function closeBulkGenerate() {
    if (isBulkGenerating) return;
    setIsBulkGenerateOpen(false);
    setBulkGenerateError("");
  }

  async function generateBulkMessages() {
    const safeOffer = bulkGenerateForm.offer.trim();
    const selectedLeads = supabaseLeads.filter((lead) => selectedBulkLeadIds.includes(lead.id));

    if (!safeOffer) {
      setBulkGenerateError("Offer is required.");
      return;
    }

    if (selectedLeads.length === 0) {
      setBulkGenerateError("Select at least one lead.");
      return;
    }

    setIsBulkGenerating(true);
    setBulkGenerateError("");
    setBulkGenerateSuccess("");
    setBulkGenerateProgress({
      total: selectedLeads.length,
      completed: 0,
      success: 0,
      failed: 0,
    });

    let successCount = 0;
    let failedCount = 0;

    for (const lead of selectedLeads) {
      const leadTarget = `${lead.role.trim() || "Decision maker"} at ${lead.company}`;

      try {
        const res = await fetch(`${API_URL}/api/generate-message`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target: leadTarget,
            offer: safeOffer,
            tone: bulkGenerateForm.tone,
            channel: bulkGenerateForm.channel,
            language: bulkGenerateForm.language,
          }),
        });

        if (!res.ok) {
          let errorMessage = `Request failed with status ${res.status}`;

          try {
            const errorBody = (await res.json()) as { error?: string };
            if (errorBody.error) errorMessage = errorBody.error;
          } catch {
            // Keep the status-based message when the response is not JSON.
          }

          throw new Error(errorMessage);
        }

        const data = (await res.json()) as GenerateMessageResponse;

        await saveGeneratedMessage(
          {
            content: data.message,
            target: leadTarget,
            offer: safeOffer,
            tone: bulkGenerateForm.tone,
            channel: bulkGenerateForm.channel,
          },
          toSelectedLead(lead),
        );

        successCount += 1;
      } catch (error) {
        failedCount += 1;
        console.error(`Failed to generate message for lead ${lead.id}:`, error);
      } finally {
        setBulkGenerateProgress((current) => ({
          ...current,
          completed: current.completed + 1,
          success: successCount,
          failed: failedCount,
        }));
      }
    }

    await Promise.all([fetchLeads(), fetchMessages(), fetchCampaigns()]);
    setSelectedBulkLeadIds([]);
    setIsBulkGenerating(false);
    setIsBulkGenerateOpen(false);
    setBulkGenerateSuccess(
      `Bulk generation complete: ${successCount} saved, ${failedCount} failed.`,
    );
  }

  async function createLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLeadSubmitting(true);
    setLeadsError("");

    try {
      if (!supabase) {
        throw new Error("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      }

      const user = requireCurrentUser();
      const { error } = await supabase.from("leads").insert({
        name: leadForm.name.trim(),
        company: leadForm.company.trim(),
        role: leadForm.role.trim(),
        website: leadForm.website.trim(),
        email: leadForm.email.trim(),
        status: leadForm.status,
        user_id: user.id,
      });

      if (error) throw error;

      setLeadForm(emptyLeadForm);
      setIsLeadFormOpen(false);
      await fetchLeads();
    } catch (error) {
      setLeadsError(getErrorMessage(error));
    } finally {
      setIsLeadSubmitting(false);
    }
  }

  function openCsvImport() {
    setCsvImportError("");
    setCsvImportSuccess("");
    setCsvImportPreview(null);
    setIsCsvImportOpen(true);
  }

  function closeCsvImport() {
    setIsCsvImportOpen(false);
    setCsvImportError("");
    setCsvImportPreview(null);
  }

  function parseLeadCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setCsvImportError("");
    setCsvImportSuccess("");
    setCsvImportPreview(null);

    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setCsvImportError("Please choose a valid .csv file.");
      return;
    }

    Papa.parse<RawCsvLeadRow>(file, {
      header: true,
      skipEmptyLines: "greedy",
      complete: (result) => {
        const headers = result.meta.fields ?? [];
        const normalizedHeaders = headers.map((header) => header.trim().toLowerCase());

        if (!normalizedHeaders.includes("name") || !normalizedHeaders.includes("company")) {
          setCsvImportError("CSV must include required headers: name, company.");
          return;
        }

        if (result.errors.length > 0 && result.data.length === 0) {
          setCsvImportError(result.errors[0]?.message ?? "Could not parse CSV file.");
          return;
        }

        if (result.data.length === 0) {
          setCsvImportError("CSV file is empty.");
          return;
        }

        const existingKeys = new Set(
          supabaseLeads.map((lead) => getLeadDuplicateKey(lead.name, lead.company)),
        );
        const csvKeys = new Set<string>();
        const validRows: CsvLeadRow[] = [];
        let skippedRows = 0;

        result.data.forEach((row) => {
          const name = normalizeCsvText(row.name);
          const company = normalizeCsvText(row.company);

          if (!name || !company) {
            skippedRows += 1;
            return;
          }

          const duplicateKey = getLeadDuplicateKey(name, company);

          if (existingKeys.has(duplicateKey) || csvKeys.has(duplicateKey)) {
            skippedRows += 1;
            return;
          }

          csvKeys.add(duplicateKey);
          validRows.push({
            name,
            company,
            role: normalizeCsvText(row.role),
            website: normalizeCsvText(row.website),
            email: normalizeCsvText(row.email),
            status: normalizeCsvStatus(row.status),
          });
        });

        if (validRows.length === 0 && skippedRows === 0) {
          setCsvImportError("CSV file does not contain any lead rows.");
          return;
        }

        setCsvImportPreview({
          fileName: file.name,
          validRows,
          skippedRows,
        });
      },
      error: (error) => {
        setCsvImportError(error.message);
      },
    });
  }

  async function importCsvLeads() {
    if (!csvImportPreview || csvImportPreview.validRows.length === 0) return;

    setIsCsvImporting(true);
    setCsvImportError("");
    setCsvImportSuccess("");

    try {
      if (!supabase) {
        throw new Error("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      }

      const user = requireCurrentUser();
      const { data: existingLeads, error: existingLeadsError } = await supabase
        .from("leads")
        .select("name,company")
        .eq("user_id", user.id);

      if (existingLeadsError) throw existingLeadsError;

      const existingKeys = new Set(
        (existingLeads ?? []).map((lead) => getLeadDuplicateKey(lead.name, lead.company)),
      );
      const rowsToInsert = csvImportPreview.validRows.filter(
        (row) => !existingKeys.has(getLeadDuplicateKey(row.name, row.company)),
      );
      const duplicateCount = csvImportPreview.validRows.length - rowsToInsert.length;

      if (rowsToInsert.length === 0) {
        setCsvImportError("No new leads to import. All valid rows already exist.");
        return;
      }

      const { error } = await supabase
        .from("leads")
        .insert(rowsToInsert.map((row) => ({ ...row, user_id: user.id })));
      if (error) throw error;

      await fetchLeads();
      setCsvImportSuccess(
        `Imported ${rowsToInsert.length} lead${rowsToInsert.length === 1 ? "" : "s"}${
          duplicateCount > 0 ? ` and skipped ${duplicateCount} duplicate${duplicateCount === 1 ? "" : "s"}` : ""
        }.`,
      );
      closeCsvImport();
    } catch (error) {
      setCsvImportError(getErrorMessage(error));
    } finally {
      setIsCsvImporting(false);
    }
  }

  async function deleteLead(id: string) {
    if (settings.confirmDelete && !window.confirm("Delete this lead?")) return;

    setLeadsError("");

    try {
      if (!supabase) {
        throw new Error("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      }

      const user = requireCurrentUser();
      const { error } = await supabase.from("leads").delete().eq("id", id).eq("user_id", user.id);
      if (error) throw error;
      if (selectedLeadId === id) {
        setSelectedLeadId(null);
        setSelectedLeadName("");
        setSelectedLeadCompany("");
        setSelectedLeadRole("");
        setSelectedLeadWebsite("");
        setSelectedLeadEmail("");
      }
      setSelectedBulkLeadIds((current) => current.filter((leadId) => leadId !== id));
      await fetchLeads();
    } catch (error) {
      setLeadsError(getErrorMessage(error));
    }
  }

  async function updateLeadStatus(id: string, status: LeadStatus) {
    setLeadsError("");
    setSupabaseLeads((current) =>
      current.map((lead) => (lead.id === id ? { ...lead, status } : lead)),
    );

    try {
      if (!supabase) {
        throw new Error("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      }

      const user = requireCurrentUser();
      const { error } = await supabase
        .from("leads")
        .update({ status })
        .eq("id", id)
        .eq("user_id", user.id);
      if (error) throw error;
      await fetchLeads();
    } catch (error) {
      setLeadsError(getErrorMessage(error));
      await fetchLeads();
    }
  }

  async function updateMessageLeadStatus(id: string, status: LeadStatus) {
    setMessagesError("");
    setMessages((current) =>
      current.map((message) =>
        message.lead_id === id && message.leads
          ? { ...message, leads: { ...message.leads, status } }
          : message,
      ),
    );
    setSupabaseLeads((current) =>
      current.map((lead) => (lead.id === id ? { ...lead, status } : lead)),
    );

    try {
      if (!supabase) {
        throw new Error("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      }

      const user = requireCurrentUser();
      const { error } = await supabase
        .from("leads")
        .update({ status })
        .eq("id", id)
        .eq("user_id", user.id);
      if (error) throw error;
      await Promise.all([fetchLeads(), fetchMessages()]);
    } catch (error) {
      setMessagesError(getErrorMessage(error));
      await Promise.all([fetchLeads(), fetchMessages()]);
    }
  }

  function openMessageLead(message: SupabaseMessage) {
    if (!message.lead_id || !message.leads) return;

    const lead = supabaseLeads.find((leadItem) => leadItem.id === message.lead_id);

    setHighlightedLeadId(message.lead_id);
    if (lead) {
      setSelectedLeadId(lead.id);
      setSelectedLeadName(lead.name);
      setSelectedLeadCompany(lead.company);
      setSelectedLeadRole(lead.role);
      setSelectedLeadWebsite(lead.website);
      setSelectedLeadEmail(lead.email ?? "");
    }
    setActiveView("Leads");
  }

  async function copySavedMessage(message: SupabaseMessage) {
    await navigator.clipboard?.writeText(message.content);
    setCopiedMessageId(message.id);
    window.setTimeout(() => {
      setCopiedMessageId((currentId) => (currentId === message.id ? null : currentId));
    }, 1600);

    if (!message.lead_id) return;

    try {
      await markLeadContactedIfNew(message.lead_id);
      await fetchMessages();
    } catch (error) {
      console.error("Failed to update lead status after copying message:", error);
      setMessagesError(getErrorMessage(error));
    }
  }

  async function sendMessageEmail(message: SupabaseMessage) {
    const email = message.leads?.email?.trim();
    if (!email) return;

    const mailtoUrl = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(
      "Quick question",
    )}&body=${encodeURIComponent(message.content)}`;

    try {
      if (message.lead_id) {
        await markLeadContactedIfNew(message.lead_id);
        await fetchMessages();
      }
    } catch (error) {
      console.error("Failed to update lead status after email action:", error);
      setMessagesError(getErrorMessage(error));
    } finally {
      window.location.href = mailtoUrl;
    }
  }

  function openFollowUp(message: SupabaseMessage) {
    setFollowUpMessage(message);
    setFollowUpForm({
      followUpType: "polite reminder",
      tone: settings.defaultTone,
      language: detectMessageLanguage(message.content, settings.defaultLanguage),
    });
    setFollowUpError("");
    setIsFollowUpOpen(true);
  }

  function closeFollowUp() {
    if (isGeneratingFollowUp) return;
    setIsFollowUpOpen(false);
    setFollowUpMessage(null);
    setFollowUpError("");
  }

  async function generateFollowUp() {
    if (!followUpMessage) return;

    const followUpTarget = followUpMessage.leads
      ? `${followUpMessage.leads.role || "Decision maker"} at ${followUpMessage.leads.company}`
      : followUpMessage.campaigns?.target || "Decision maker";
    const followUpOffer = followUpMessage.campaigns?.offer || offer.trim();
    const followUpChannel = toDashboardChannel(followUpMessage.campaigns?.channel ?? channel);

    if (!followUpOffer) {
      setFollowUpError("Campaign offer is required to generate a follow-up.");
      return;
    }

    setIsGeneratingFollowUp(true);
    setFollowUpError("");

    try {
      if (!supabase) {
        throw new Error("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      }

      const user = requireCurrentUser();
      const res = await fetch(`${API_URL}/api/generate-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: followUpTarget,
          offer: followUpOffer,
          tone: followUpForm.tone,
          channel: followUpChannel,
          language: followUpForm.language,
          previousMessage: followUpMessage.content,
          followUpType: followUpForm.followUpType,
        }),
      });

      if (!res.ok) {
        let errorMessage = `Request failed with status ${res.status}`;

        try {
          const errorBody = (await res.json()) as { error?: string };
          if (errorBody.error) errorMessage = errorBody.error;
        } catch {
          // Keep the status-based message when the response is not JSON.
        }

        throw new Error(errorMessage);
      }

      const data = (await res.json()) as GenerateMessageResponse;
      const { data: existingFollowUps, error: followUpsError } = await supabase
        .from("messages")
        .select("id")
        .eq("parent_message_id", followUpMessage.id)
        .eq("user_id", user.id);

      if (followUpsError) throw followUpsError;

      await saveGeneratedMessage(
        {
          content: data.message,
          target: followUpTarget,
          offer: followUpOffer,
          tone: followUpForm.tone,
          channel: followUpChannel,
          campaignId: followUpMessage.campaign_id,
          type: "follow_up",
          parentMessageId: followUpMessage.id,
          sequenceNumber: (existingFollowUps?.length ?? 0) + 2,
        },
        followUpMessage.lead_id && followUpMessage.leads
          ? {
              id: followUpMessage.lead_id,
              name: followUpMessage.leads.name,
              company: followUpMessage.leads.company,
              role: followUpMessage.leads.role,
              website: followUpMessage.leads.website,
              email: followUpMessage.leads.email,
            }
          : null,
      );

      await fetchMessages();
      setIsFollowUpOpen(false);
      setFollowUpMessage(null);
      setFollowUpError("");
    } catch (error) {
      console.error("Failed to generate follow-up:", error);
      setFollowUpError(getErrorMessage(error));
    } finally {
      setIsGeneratingFollowUp(false);
    }
  }

  async function deleteMessage(id: string) {
    if (settings.confirmDelete && !window.confirm("Delete this message?")) return;

    setMessagesError("");

    try {
      if (!supabase) {
        throw new Error("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      }

      const user = requireCurrentUser();
      const { error } = await supabase.from("messages").delete().eq("id", id).eq("user_id", user.id);
      if (error) throw error;
      await fetchMessages();
    } catch (error) {
      setMessagesError(getErrorMessage(error));
    }
  }

  function openCreateCampaign() {
    setEditingCampaign(null);
    setCampaignForm(emptyCampaignForm);
    setCampaignsError("");
    setIsCampaignFormOpen(true);
  }

  function openEditCampaign(campaign: SupabaseCampaign) {
    setEditingCampaign(campaign);
    setCampaignForm({
      name: campaign.name,
      target: campaign.target,
      offer: campaign.offer,
      tone:
        campaign.tone === "professional" || campaign.tone === "direct"
          ? campaign.tone
          : "friendly",
      channel: toDashboardChannel(campaign.channel),
    });
    setCampaignsError("");
    setIsCampaignFormOpen(true);
  }

  function closeCampaignForm() {
    setIsCampaignFormOpen(false);
    setEditingCampaign(null);
    setCampaignForm(emptyCampaignForm);
  }

  async function saveCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsCampaignSubmitting(true);
    setCampaignsError("");

    try {
      if (!supabase) {
        throw new Error("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      }

      const user = requireCurrentUser();
      const payload = {
        name: campaignForm.name.trim(),
        target: campaignForm.target.trim(),
        offer: campaignForm.offer.trim(),
        tone: campaignForm.tone,
        channel: campaignForm.channel,
        user_id: user.id,
      };

      if (!payload.name || !payload.target || !payload.offer) {
        throw new Error("Name, target, and offer are required.");
      }

      const { error } = editingCampaign
        ? await supabase
            .from("campaigns")
            .update(payload)
            .eq("id", editingCampaign.id)
            .eq("user_id", user.id)
        : await supabase.from("campaigns").insert(payload);

      if (error) throw error;

      closeCampaignForm();
      await fetchCampaigns();
    } catch (error) {
      setCampaignsError(getErrorMessage(error));
    } finally {
      setIsCampaignSubmitting(false);
    }
  }

  async function deleteCampaign(id: string) {
    if (settings.confirmDelete && !window.confirm("Delete this campaign?")) return;

    setCampaignsError("");

    try {
      if (!supabase) {
        throw new Error("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      }

      const user = requireCurrentUser();
      const { error } = await supabase
        .from("campaigns")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);
      if (error) throw error;
      await fetchCampaigns();
    } catch (error) {
      setCampaignsError(getErrorMessage(error));
    }
  }

  function useCampaign(campaign: SupabaseCampaign) {
    setTarget(campaign.target);
    setOffer(campaign.offer);
    setTone(toDashboardTone(campaign.tone));
    setChannel(toDashboardChannel(campaign.channel));
    setSelectedLeadId(null);
    setSelectedLeadName("");
    setSelectedLeadCompany("");
    setSelectedLeadRole("");
    setSelectedLeadWebsite("");
    setSelectedLeadEmail("");
    setActiveView("Dashboard");
  }

  function updateBooleanSetting(key: "autoSave" | "confirmDelete" | "compactMode", value: boolean) {
    setSettings((current) => ({ ...current, [key]: value }));
    persistSetting(key, value);
  }

  function updateDefaultTone(value: ApiTone) {
    setSettings((current) => ({ ...current, defaultTone: value }));
    persistSetting("defaultTone", value);
    setTone(toDashboardTone(value));
  }

  function updateDefaultChannel(value: Channel) {
    setSettings((current) => ({ ...current, defaultChannel: value }));
    persistSetting("defaultChannel", value);
    setChannel(value);
  }

  function updateDefaultLanguage(value: Language) {
    setSettings((current) => ({ ...current, defaultLanguage: value }));
    persistSetting("defaultLanguage", value);
    setLanguage(value);
  }

  function updateTheme(value: ThemeSetting) {
    setSettings((current) => ({ ...current, theme: value }));
    persistSetting("theme", value);
    applyTheme(value);
  }

  function resetSettings() {
    clearStoredSettings();
    setSettings(defaultSettings);
    setTone(toDashboardTone(defaultSettings.defaultTone));
    setChannel(defaultSettings.defaultChannel);
    setLanguage(defaultSettings.defaultLanguage);
    applyTheme(defaultSettings.theme);
  }

  const isAppStartupReady =
    hasStartupTimedOut ||
    (hasMinimumStartupElapsed && isThemeReady && !isAuthLoading && isInitialDataReady);

  if (!currentUser) {
    if (showAuthPage) {
      return (
        <>
          <AppLoadingScreen isReady={isAppStartupReady} />
          {isAppStartupReady ? (
            <AuthPage
              initialMode={authInitialMode}
              onBack={() => {
                setShowAuthPage(false);
                setAuthInitialMode("signup");
              }}
            />
          ) : null}
        </>
      );
    }

    return (
      <>
        <AppLoadingScreen isReady={isAppStartupReady} />
        {isAppStartupReady ? (
          <LandingPage
            onStart={() => {
              setAuthInitialMode("signup");
              setShowAuthPage(true);
            }}
            onLogin={() => {
              setAuthInitialMode("login");
              setShowAuthPage(true);
            }}
          />
        ) : null}
      </>
    );
  }

  const dashboardContent = (
    <>
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.78fr)]">
        <Generator
          target={target}
          offer={offer}
          tone={tone}
          channel={channel}
          language={language}
          selectedLead={selectedLead}
          isLoading={isLoading}
          onTargetChange={setTarget}
          onOfferChange={setOffer}
          onToneChange={setTone}
          onChannelChange={setChannel}
          onLanguageChange={setLanguage}
          onGenerate={() => {
            void handleGenerateMessage();
          }}
        />
        <MessagePanel
          message={generatedMessage}
          isLoading={isLoading}
          isSaving={isSaving}
          saveError={saveError}
          autoSaveStatus={autoSaveStatus}
          isCurrentMessageSaved={currentMessageIsSaved}
          selectedLead={selectedLead}
          hasGeneratedMessage={hasGeneratedMessage}
          onCopy={copyMessage}
          onRegenerate={() => {
            void handleGenerateMessage();
          }}
          onSave={saveMessage}
        />
      </section>

      {generationError ? (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {generationError}
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Leads" value={dashboardStats.totalLeads} trend="Total leads" />
        <StatCard label="Contacted" value={dashboardStats.contacted} trend="Contacted or beyond" />
        <StatCard label="Replied" value={dashboardStats.replied} trend="Marked replied" />
        <StatCard label="Interested" value={dashboardStats.interested} trend="Marked interested" />
        <StatCard label="Reply Rate" value={dashboardStats.replyRate} trend="Replied / contacted leads" />
      </section>

      <DashboardLeadsTable
        leads={supabaseLeads}
        selectedLeadId={selectedLeadId}
        isLeadsLoading={isLeadsLoading}
        leadsError={leadsError}
        isLoading={isLoading}
        canGenerateForLead={Boolean(offer.trim())}
        onSelectLead={selectLead}
        onGenerateForLead={generateForLead}
      />
    </>
  );

  return (
    <>
      <AppLoadingScreen isReady={isAppStartupReady} />
      {isAppStartupReady ? (
    <div className="premium-noise-bg min-h-screen bg-slate-50 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.08),transparent_30rem),radial-gradient(circle_at_top_right,rgba(99,102,241,0.06),transparent_28rem),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] text-slate-950 antialiased dark:bg-[#0B1220] dark:bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.16),transparent_32rem),radial-gradient(circle_at_top_right,rgba(99,102,241,0.12),transparent_28rem),linear-gradient(180deg,#0B1220_0%,#0F172A_100%)] dark:text-gray-200">
      <MobileTopBar activeView={activeView} onNavigate={setActiveView} />
      <div className="flex min-h-screen">
        <Sidebar activeView={activeView} onNavigate={setActiveView} />

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
	          <div className={`mx-auto max-w-7xl ${settings.compactMode ? "space-y-4" : "space-y-6"}`}>
            <div className="flex items-center justify-end gap-3">
              <span className="hidden max-w-xs truncate rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-500 shadow-sm sm:block dark:border-white/[0.06] dark:bg-white/[0.04] dark:text-gray-400 dark:shadow-black/20">
                {currentUser.email}
              </span>
              <button
                type="button"
                onClick={() => {
                  void logout();
                }}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950 hover:shadow dark:border-white/[0.06] dark:bg-white/[0.04] dark:text-gray-300 dark:shadow-black/20 dark:hover:border-white/10 dark:hover:bg-white/[0.08] dark:hover:text-gray-100"
              >
                Logout
              </button>
            </div>
            {activeView === "Dashboard" ? (
              <>
                <header className="hidden items-center justify-between lg:flex">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">
                      Dashboard
                    </p>
                    <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950 dark:text-gray-200">
                      Sales message workspace
                    </h1>
                  </div>
                  <span className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-500 shadow-sm dark:border-white/[0.06] dark:bg-white/[0.04] dark:text-gray-400">
                    Private workspace
                  </span>
                </header>
                <section className="lg:hidden">
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">
                    Dashboard
                  </p>
                  <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 dark:text-gray-200">
                    Sales message workspace
                  </h1>
                </section>
                {dashboardContent}
              </>
            ) : activeView === "Campaigns" ? (
              <CampaignsPage
                campaigns={campaigns}
                isLoading={isCampaignsLoading}
                error={campaignsError}
                search={campaignSearch}
                form={campaignForm}
                isFormOpen={isCampaignFormOpen}
                isSubmitting={isCampaignSubmitting}
                editingCampaign={editingCampaign}
                onSearchChange={setCampaignSearch}
                onOpenCreate={openCreateCampaign}
                onOpenEdit={openEditCampaign}
                onCloseForm={closeCampaignForm}
                onFormChange={(field, value) =>
                  setCampaignForm((current) => ({ ...current, [field]: value }))
                }
                onSubmit={saveCampaign}
                onDelete={(id) => {
                  void deleteCampaign(id);
                }}
                onUseCampaign={useCampaign}
              />
            ) : activeView === "Leads" ? (
	              <LeadsPage
	                leads={supabaseLeads}
	                isLoading={isLeadsLoading}
	                error={leadsError}
	                importSuccess={csvImportSuccess}
	                bulkSuccess={bulkGenerateSuccess}
	                highlightedLeadId={highlightedLeadId}
	                selectedLeadIds={selectedBulkLeadIds}
	                isFormOpen={isLeadFormOpen}
	                isImportOpen={isCsvImportOpen}
	                isBulkGenerateOpen={isBulkGenerateOpen}
	                form={leadForm}
	                isSubmitting={isLeadSubmitting}
	                importPreview={csvImportPreview}
	                importError={csvImportError}
	                isImporting={isCsvImporting}
	                bulkForm={bulkGenerateForm}
	                isBulkGenerating={isBulkGenerating}
	                bulkProgress={bulkGenerateProgress}
	                bulkError={bulkGenerateError}
	                onOpenForm={() => setIsLeadFormOpen(true)}
	                onCloseForm={() => {
	                  setIsLeadFormOpen(false);
	                  setLeadForm(emptyLeadForm);
	                }}
	                onOpenImport={openCsvImport}
	                onCloseImport={closeCsvImport}
	                onOpenBulkGenerate={openBulkGenerate}
	                onCloseBulkGenerate={closeBulkGenerate}
	                onFormChange={(field, value) =>
	                  setLeadForm((current) => ({ ...current, [field]: value }))
	                }
	                onBulkFormChange={(field, value) =>
	                  setBulkGenerateForm((current) => ({
	                    ...current,
	                    [field]:
	                      field === "channel"
	                        ? toDashboardChannel(value)
	                        : field === "language"
	                          ? toLanguage(value)
	                        : field === "tone" &&
	                            (value === "friendly" || value === "professional" || value === "direct")
	                          ? value
	                          : value,
	                  }))
	                }
	                onSubmit={createLead}
	                onCsvFileChange={parseLeadCsv}
	                onConfirmImport={() => {
	                  void importCsvLeads();
	                }}
	                onConfirmBulkGenerate={() => {
	                  void generateBulkMessages();
	                }}
	                onToggleLeadSelection={toggleLeadSelection}
	                onToggleAllVisible={toggleAllVisibleLeads}
	                onDelete={(id) => {
	                  void deleteLead(id);
	                }}
                onStatusChange={(id, status) => {
                  void updateLeadStatus(id, status);
                }}
              />
            ) : activeView === "Messages" ? (
	              <MessagesPage
	                messages={messages}
	                campaigns={campaigns}
	                isLoading={isMessagesLoading}
	                error={messagesError}
	                search={messageSearch}
	                statusFilter={messageStatusFilter}
	                campaignFilter={messageCampaignFilter}
	                copiedMessageId={copiedMessageId}
	                onSearchChange={setMessageSearch}
	                onStatusFilterChange={setMessageStatusFilter}
	                onCampaignFilterChange={setMessageCampaignFilter}
	                onOpenLead={openMessageLead}
	                onLeadStatusChange={(id, status) => {
	                  void updateMessageLeadStatus(id, status);
	                }}
	                onSendEmail={(message) => {
	                  void sendMessageEmail(message);
	                }}
	                followUpMessage={followUpMessage}
	                followUpForm={followUpForm}
	                isFollowUpOpen={isFollowUpOpen}
	                isGeneratingFollowUp={isGeneratingFollowUp}
	                followUpError={followUpError}
	                onOpenFollowUp={openFollowUp}
	                onCloseFollowUp={closeFollowUp}
	                onFollowUpFormChange={(field, value) => {
	                  setFollowUpForm((current) => ({
	                    ...current,
	                    [field]:
	                      field === "tone" &&
	                      (value === "friendly" || value === "professional" || value === "direct")
	                        ? value
	                        : field === "language"
	                          ? toLanguage(value)
	                        : field === "followUpType" &&
	                            (value === "polite reminder" ||
	                              value === "value add" ||
	                              value === "final check-in")
	                          ? value
	                          : current[field],
	                  }));
	                }}
	                onGenerateFollowUp={() => {
	                  void generateFollowUp();
	                }}
	                onCopy={(message) => {
	                  void copySavedMessage(message);
	                }}
                onDelete={(id) => {
                  void deleteMessage(id);
                }}
              />
	            ) : (
	              <SettingsPage
	                settings={settings}
	                onToggle={updateBooleanSetting}
	                onDefaultToneChange={updateDefaultTone}
	                onDefaultChannelChange={updateDefaultChannel}
	                onDefaultLanguageChange={updateDefaultLanguage}
	                onThemeChange={updateTheme}
	                onReset={resetSettings}
	              />
	            )}
          </div>
        </main>
      </div>
    </div>
      ) : null}
    </>
  );
}
