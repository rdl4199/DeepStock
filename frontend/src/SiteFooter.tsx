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
      <div className="siteFooterBrand">{appName}</div>
      <div className="siteFooterText">
        Stock signals, saved analysis, and technical indicators in one place.
      </div>
      <div className="siteFooterBottom">
        © {year} {appName}. Built with React and microservices.
      </div>
    </footer>
  );
}