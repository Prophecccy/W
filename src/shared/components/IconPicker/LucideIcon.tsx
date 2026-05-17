import * as LucideIcons from "lucide-react";

interface LucideIconProps extends LucideIcons.LucideProps {
  name: string;
}

export function LucideIcon({ name, ...props }: LucideIconProps) {
  // Try to find the icon component by its string name from the lucide-react exports
  const IconComponent = (LucideIcons as any)[name] as LucideIcons.LucideIcon | undefined;
  
  if (!IconComponent) {
    // Fallback to HelpCircle if the icon name is invalid or missing
    return <LucideIcons.HelpCircle {...props} />;
  }

  return <IconComponent {...props} />;
}

