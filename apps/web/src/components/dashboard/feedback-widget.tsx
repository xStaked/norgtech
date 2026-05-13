"use client";

import { MorphSurface } from "@/components/ui/morph-surface";

export function FeedbackWidget() {
  return (
    <div className="flex justify-center">
      <MorphSurface
        triggerLabel="Enviar feedback"
        placeholder="¿Qué podemos mejorar? Tu opinión nos ayuda a crecer..."
        onSubmit={async (formData) => {
          const message = formData.get("message") as string;
          console.log("Feedback submitted:", message);
          // Aquí se conectaría con un endpoint de feedback
        }}
        onSuccess={() => {
          console.log("Feedback enviado exitosamente");
        }}
        className="w-full"
        collapsedWidth={340}
        expandedWidth={340}
      />
    </div>
  );
}
