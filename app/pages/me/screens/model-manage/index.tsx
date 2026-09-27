import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import {
  Linking,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation } from "expo-router";
import { useTheme } from "../../../../../theme/useTheme";
import { Provider, useProviders } from "../../../../store/models";
import eventBus from "../../../../utils/eventBus";
import {
  BalanceInfo,
  fetchProviderBalance,
} from "../../../../utils/ai";

type BalanceState =
  | { status: "loading" }
  | { status: "ok"; info: BalanceInfo }
  | { status: "none" };

const ModelManage = () => {
  const { themeColor } = useTheme();
  const navigate = useNavigation();
  const { loadProviders } = useProviders();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [balances, setBalances] = useState<Record<string, BalanceState>>({});

  useLayoutEffect(() => {
    navigate.setOptions({
      headerShown: true,
      headerTitle: "模型管理",
      headerTitleAlign: "center",
      headerTintColor: "#111",
      headerShadowVisible: false,
      headerStyle: { backgroundColor: "#fff" },
    });
  }, []);

  const refresh = useCallback(async () => {
    setProviders(await loadProviders());
  }, [loadProviders]);

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    eventBus.on("providers-updated", handler);
    return () => {
      eventBus.off("providers-updated", handler);
    };
  }, [refresh]);

  const queryBalance = useCallback(async (p: Provider) => {
    const key = p.apiKey;
    if (!key) {
      setBalances((pre) => ({ ...pre, [p.id]: { status: "none" } }));
      return;
    }
    setBalances((pre) => ({ ...pre, [p.id]: { status: "loading" } }));
    try {
      const info = await fetchProviderBalance(p.apiDomain, key);
      setBalances((pre) => ({
        ...pre,
        [p.id]: info ? { status: "ok", info } : { status: "none" },
      }));
    } catch {
      setBalances((pre) => ({ ...pre, [p.id]: { status: "none" } }));
    }
  }, []);

  // 供应商列表变化后逐条查询余额
  useEffect(() => {
    providers.forEach((p) => queryBalance(p));
  }, [providers, queryBalance]);

  const list = providers;

  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>
      <ScrollView style={{ flex: 1 }}>
        {list.length === 0 && (
          <Text
            style={{
              textAlign: "center",
              color: themeColor.text3,
              marginTop: 40,
            }}
          >
            还没有供应商，点下方添加
          </Text>
        )}
        {list.map((p) => {
          const bal = balances[p.id];
          const consoleUrl = p.consoleUrl;
          return (
            <TouchableOpacity
              key={p.id}
              activeOpacity={0.7}
              onPress={() =>
                navigate.navigate("pages/me/screens/model-manage/provider", {
                  providerId: p.id,
                })
              }
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderBottomWidth: 0.5,
                borderBottomColor: themeColor.line2,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, color: themeColor.text5 }}>
                  {p.name}
                </Text>
                <Text
                  numberOfLines={1}
                  style={{ color: themeColor.text3, fontSize: 12, marginTop: 3 }}
                >
                  {p.models.length} 个模型 ·{" "}
                  {p.apiKey ? p.apiKey.slice(0, 6) + "…" : "未填 Key"}
                </Text>
                {p.apiKey ? (
                  <TouchableOpacity
                    onPress={() => queryBalance(p)}
                    style={{ marginTop: 4, alignSelf: "flex-start" }}
                  >
                    <Text style={{ color: themeColor.textBlue, fontSize: 12 }}>
                      {bal?.status === "loading"
                        ? "余额查询中…"
                        : bal?.status === "ok"
                        ? `余额：¥${bal.info.total}${
                            bal.info.available
                              ? `（可用 ${bal.info.available}）`
                              : ""
                          }`
                        : bal?.status === "none"
                        ? "该平台暂无余额查询接口"
                        : "点此查询余额"}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            {consoleUrl ? (
              <TouchableOpacity
                onPress={() => Linking.openURL(consoleUrl)}
                style={{ paddingHorizontal: 8, paddingVertical: 4 }}
              >
                <Text style={{ color: themeColor.textBlue, fontSize: 13 }}>控制台</Text>
              </TouchableOpacity>
            ) : null}
            <Text style={{ color: themeColor.text3, fontSize: 20 }}>›</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <TouchableOpacity
        onPress={() =>
          navigate.navigate("pages/me/screens/model-manage/provider")
        }
        style={{
          backgroundColor: themeColor.primary,
          margin: 16,
          paddingVertical: 12,
          borderRadius: 6,
          alignItems: "center",
        }}
      >
        <Text style={{ color: "#fff", fontSize: 16 }}>
          ＋ 添加供应商
        </Text>
      </TouchableOpacity>
    </View>
  );
};

export default ModelManage;
