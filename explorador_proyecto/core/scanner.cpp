#include <iostream>
#include <filesystem>
#include <string>

extern "C" {

#ifdef _WIN32
    __declspec(dllexport) const char* scan_directory(const char* path) {
#else
    const char* scan_directory(const char* path) {
#endif
        static std::string result;
        result = "";

        try {
            // Iterates through directory returning pipes delimited payload | Name | Type | Time | Size 
            for (const auto& entry : std::filesystem::directory_iterator(path)) {
                std::string file_name = entry.path().filename().string();
                std::string is_dir = entry.is_directory() ? "DIR" : "FILE";
                long long timestamp = 0;
                uintmax_t size = 0;

                try {
                    timestamp = entry.last_write_time().time_since_epoch().count();
                    if (!entry.is_directory()) {
                        size = entry.file_size();
                    }
                } catch (...) {}

                result += file_name + "|" + is_dir + "|" + std::to_string(timestamp) + "|" + std::to_string(size) + "*";
            }
        } catch (...) {
            return "ERROR";
        }
        
        return result.c_str();
    }

#ifdef _WIN32
    __declspec(dllexport) long long calculate_folder_size(const char* path) {
#else
    long long calculate_folder_size(const char* path) {
#endif
        long long total_size = 0;

        try {
            // Recursively descends through sub-folders silently skipping unauthorized/denied system scopes
            for (const auto& entry : std::filesystem::recursive_directory_iterator(path, std::filesystem::directory_options::skip_permission_denied)) {
                if (!entry.is_directory()) {
                    total_size += entry.file_size();
                }
            }
        } catch (...) {}

        return total_size;
    }
}