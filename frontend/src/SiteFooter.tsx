import React from "react";

type FooterProps = {
  appName?: string;
};

export default function SiteFooter({
  appName = "DeepStock",
}: FooterProps): JSX.Element {
  const year = new Date().getFullYear();

  return (
    <footer className="siteFooter">
      <div className="siteFooterInner">
        <div className="siteFooterLeft">
          <div className="siteFooterBrand">{appName}</div>
          <div className="siteFooterText">
            Stock signals, saved analysis, and technical indicators in one place.
          </div>
        </div>

        <div className="siteFooterRight">
          <a className="siteFooterLink" href="/">
            Home
          </a>
          <a className="siteFooterLink" href="/savedpage">
            Saved
          </a>
        </div>
      </div>

      <div className="siteFooterBottom">
        © {year} {appName}. Built with React, charts, and microservices.
      </div>
    </footer>
  );
}