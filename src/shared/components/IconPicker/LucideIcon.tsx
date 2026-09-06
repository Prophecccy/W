import * as LucideIcons from "lucide-react";

interface LucideIconProps extends LucideIcons.LucideProps {
  name: string;
}

export function LucideIcon({ name, ...props }: LucideIconProps) {
  // Try to find the icon component by its string name, clean name, or prefixed name from lucide-react exports
  const cleanName = name ? name.replace(/^Lucide/, "") : "";
  const IconComponent = (
    (name ? (LucideIcons as any)[name] : undefined) ||
    (cleanName ? (LucideIcons as any)[cleanName] : undefined) ||
    (name ? (LucideIcons as any)[`Lucide${name}`] : undefined)
  ) as LucideIcons.LucideIcon | undefined;
  
  if (!IconComponent) {
    // Fallback to HelpCircle if the icon name is invalid or missing
    return <LucideIcons.HelpCircle {...props} />;
  }

  return <IconComponent {...props} />;
}

