"use client";

import { useEffect } from "react";
import "./prototype.css";

export default function MatchingV2PrototypeClient() {
  useEffect(() => {
    if (document.querySelector("script[data-matching-v2-prototype]")) return;
    const script = document.createElement("script");
    script.src = "/js/matching-v2-prototype.js";
    script.type = "module";
    script.dataset.matchingV2Prototype = "true";
    document.body.appendChild(script);
  }, []);

  return (
    <div className="matching-v2-prototype" data-prototype-page>
      <a className="prototype-skip-link" href="#prototype-main-content">跳到主要内容</a>
      <div id="matching-v2-prototype-root">
        <div className="prototype-boot" role="status">正在加载本地原型…</div>
      </div>
    </div>
  );
}
