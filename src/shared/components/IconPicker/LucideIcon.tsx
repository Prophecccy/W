import * as LucideIcons from "lucide-react";

interface LucideIconProps extends LucideIcons.LucideProps {
  name: string;
}

export function LucideIcon({ name, ...props }: LucideIconProps) {
  // @ts-ignore - Dynamic key access on lucide-react exports
  const IconComponent = LucideIcons[name];
  
  if (!IconComponent) {
    // Fallback if icon name is invalid or misspelled
    return <LucideIcons.HelpCircle {...props} />;
  }

  return <IconComponent {...props} />;
}
