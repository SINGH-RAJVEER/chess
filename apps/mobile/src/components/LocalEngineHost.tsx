import { useRef } from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";
import { LOCAL_ENGINE_HTML } from "../generated/local-engine-page";
import type { MobileEngine } from "../lib/computer-game";

export default function LocalEngineHost({ engine }: { engine: MobileEngine }) {
	const host = useRef<WebView<unknown>>(null);
	return (
		<View
			pointerEvents="none"
			style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
		>
			<WebView<unknown>
				ref={host}
				source={{ html: LOCAL_ENGINE_HTML, baseUrl: "https://sixtyfour.local/" }}
				originWhitelist={["https://sixtyfour.local"]}
				javaScriptEnabled
				onMessage={(event) => {
					engine.attach((script) => host.current?.injectJavaScript(script));
					engine.receive(event.nativeEvent.data);
				}}
				onError={(event) => engine.fail(new Error(event.nativeEvent.description))}
				onShouldStartLoadWithRequest={(request) =>
					request.url === "about:blank" ||
					request.url.startsWith("https://sixtyfour.local/")
				}
			/>
		</View>
	);
}
