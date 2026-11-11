export default function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center p-8 sm:p-12 border border-dashed border-[#CBD5E1] dark:border-[#334155] rounded-2xl bg-[#F8FAFC] dark:bg-[#0B1728] transition-colors">
      {Icon && (
        <div className="w-14 h-14 rounded-2xl bg-[#E2E8F0] dark:bg-[#1E293B] text-[#0E4D84] dark:text-[#38BDF8] flex items-center justify-center mb-4">
          <Icon className="w-7 h-7" aria-hidden="true" />
        </div>
      )}

      <h3 className="text-base sm:text-lg font-bold text-[#0B1C33] dark:text-[#F1F5F9] mb-1.5">
        {title}
      </h3>

      {description && (
        <p className="text-sm text-[#64748B] dark:text-[#94A3B8] max-w-sm mb-6 leading-relaxed">
          {description}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-center gap-3">
        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-[#0E4D84] hover:bg-[#09355C] text-white text-sm font-semibold transition-colors min-h-[44px]"
          >
            {actionLabel}
          </button>
        )}

        {secondaryActionLabel && onSecondaryAction && (
          <button
            type="button"
            onClick={onSecondaryAction}
            className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl border border-[#CBD5E1] dark:border-[#334155] hover:bg-white dark:hover:bg-[#1E293B] text-[#0B1C33] dark:text-[#F1F5F9] text-sm font-medium transition-colors min-h-[44px]"
          >
            {secondaryActionLabel}
          </button>
        )}
      </div>
    </div>
  );
}
