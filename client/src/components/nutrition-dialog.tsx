import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Apple } from "lucide-react";
import { NutritionPanel } from "@/components/nutrition-panel";

/** Coach view of an athlete's macro/micro nutrition targets -- full
 * read-write, no AI in the loop (see NutritionPanel's comment). Built for
 * a program with a real nutritionist backing these numbers; the coach is
 * just entering that plan here so the athlete can see it in the app. */
export function NutritionDialog({
  open,
  onOpenChange,
  athleteName,
  nutritionUrl,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  athleteName: string;
  nutritionUrl: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Apple className="h-5 w-5" />
            {athleteName}'s Nutrition Targets
          </DialogTitle>
          <DialogDescription>
            Set the actual macro and micronutrient targets for this athlete -- ideally from a
            real nutritionist's plan. The app's AI never generates these numbers.
          </DialogDescription>
        </DialogHeader>
        <NutritionPanel nutritionUrl={nutritionUrl} editable />
      </DialogContent>
    </Dialog>
  );
}
