"use client";

import { Suspense } from "react";
import { Header } from "@/components/layout/header";
import { PowerDialer } from "@/components/dialer/power-dialer";

function DialerContent() {
  return (
    <div 
      className="flex-1 overflow-hidden opacity-0 animate-fade-in"
      style={{ animationDelay: "0ms", animationFillMode: "forwards" }}
    >
      <PowerDialer />
    </div>
  );
}

export default function DialerPage() {
  return (
    <div className="flex flex-col h-full">
      <Header title="Power Dialer" showSearch={false} />
      <Suspense fallback={<div className="flex-1 flex items-center justify-center">Loading...</div>}>
        <DialerContent />
      </Suspense>
    </div>
  );
}
