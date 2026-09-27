import { useLayoutEffect } from "react";
import {
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation } from "expo-router";
import { useTheme } from "../../../../../theme/useTheme";
import SearchBar from "../../../../component/complex/SearchBar";

const AddContacts = () => {
  const navigate = useNavigation();
  const { themeColor } = useTheme();

  useLayoutEffect(() => {
    navigate.setOptions({
      headerShown: true,
      headerTitle: "添加朋友",
      headerTitleAlign: "center",
      headerTintColor: "#111",
      headerShadowVisible: false,
      headerStyle: { backgroundColor: "#fff" },
    });
  }, [navigate]);

  return (
    <ScrollView
      style={{ backgroundColor: "#fff", flex: 1 }}
      contentContainerStyle={{ paddingBottom: 30 }}
    >
      <SearchBar
        placeholder="搜索角色"
        onPress={() => {
          navigate.navigate("pages/contacts/screens/add-contacts-search/index");
        }}
      />

    </ScrollView>
  );
};

export default AddContacts;
