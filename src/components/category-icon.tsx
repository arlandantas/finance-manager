import {
  Baby,
  BookOpen,
  Briefcase,
  Bus,
  Car,
  Coffee,
  Dumbbell,
  Fuel,
  Gift,
  GraduationCap,
  Heart,
  Home,
  Music,
  Package,
  PawPrint,
  Pill,
  Plane,
  PlusCircle,
  Receipt,
  Shirt,
  ShoppingCart,
  TrendingUp,
  Tv,
  Utensils,
  Wallet,
  Wrench,
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
  "paw-print": PawPrint,
  baby: Baby,
  plane: Plane,
  shirt: Shirt,
  gift: Gift,
  dumbbell: Dumbbell,
  tv: Tv,
  wrench: Wrench,
  heart: Heart,
  briefcase: Briefcase,
  fuel: Fuel,
  bus: Bus,
  coffee: Coffee,
  music: Music,
  "book-open": BookOpen,
} as const;

/** Chaves com ícone próprio (teste: toda chave de `CATEGORY_ICON_KEYS` precisa estar aqui). */
export const CATEGORY_ICON_MAP_KEYS = Object.keys(ICONS);

export function CategoryIcon({ icon, size = 22 }: { icon: string; size?: number }) {
  const Icon = ICONS[icon as keyof typeof ICONS] ?? Package;
  return <Icon size={size} aria-hidden="true" />;
}
