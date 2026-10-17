// Monta o documento HTML usado pela renderização SolidStart no servidor.
import { createHandler, StartServer } from "@solidjs/start/server";

export default createHandler(() => (
	<StartServer
		document={({ assets, children, scripts }) => (
			<html lang="pt-BR" class="dark dark-theme bg-canvas text-text">
				<head>
					<meta charset="utf-8" />
					<meta name="viewport" content="width=device-width, initial-scale=1" />
					<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
					{assets}
				</head>
				<body class="m-0 min-w-80 bg-canvas">
					<div id="app">{children}</div>
					{scripts}
				</body>
			</html>
		)}
	/>
));
