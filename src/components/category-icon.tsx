import {
  Car,
  GraduationCap,
  Home,
  Package,
  Pill,
  PlusCircle,
  Receipt,
  ShoppingCart,
  TrendingUp,
  Utensils,
  Wallet,
} from "lucide-react";

const ICONS = {
  "shopping-cart": ShoppingCart,
  home: Home,
  receipt: Receipt,
  car: Car,
  pill: Pill,
  "graduation-cap": GraduationCap,
  utensils: Utensils,
  package: Package,
  wallet: Wallet,
  "trending-up": TrendingUp,
  "plus-circle": PlusCircle,
} as const;

export function CategoryIcon({ icon, size = 22 }: { icon: string; size?: number }) {
  const Icon = ICONS[icon as keyof typeof ICONS] ?? Package;
  return <Icon size={size} aria-hidden="true" />;
}
